import express = require('express')
import canvas = require('canvas')
import yargs = require('yargs')
import fs = require('fs/promises')
import path = require('path')
import WebSocket = require('ws')
import http = require('http')
import ffmpegCommand = require('fluent-ffmpeg')
import Stream = require('stream')
import async = require('async')
import { extractScreenshot } from './utils/imageExtraction'
import { loadConfig } from './utils/config'
import { getTimestamps, secondsToTimestamp } from './utils/timestamps'
import { generateVcs, prepareThumbnail } from './utils/vcs'

interface VcsFile {
    file: string,
    timestamps: number[],

    videoInfo: {
        duration: number
        width: number
        height: number
        fps: number
        audioCodec: string
        videoCodec: string
        size: number
    }
    generationTask: VcsGenerationTask | undefined
}

let files: VcsFile[] = []
let tasksQueue: VcsGenerationTask[] = []
let queueRunning = false

async function main() {
    const args = await yargs
        .option('config', {
            alias: 'c',
            default: './vcs.config.json'
        })
        .argv
    const config = await loadConfig(args.config, {
        port: 33321,
        ffmpegPath: '',
        ffprobePath: '',
        background: 'rgb(45, 45, 45)',
        textColor: '#fff',
        borderColor: 'rgb(194, 190, 197)',
        textShadow: '#000',
        thumbnailsPadding: 5,
        thumbnailsMargin: 5,
        thumbnailsBorder: 1,
        thumbnailsSize: 240,
        columns: 8,
        rows: 8,
        font: 'bold 13px "Fira Code"',
        frontEndLocation: '../frontend/dist',
        autosaveFilesLocation: './.vcs.files-autosave.json',
        searchFileDirectories: [],
        searchFileDepth: 3,
    })

    if (config.ffmpegPath) {
        ffmpegCommand.setFfmpegPath(config.ffmpegPath)
    }

    if (config.ffprobePath) {
        ffmpegCommand.setFfprobePath(config.ffprobePath)
    }

    await loadFiles()

    const app = express()
    const server = http.createServer(app)
    const wss = new WebSocket.Server({ server })

    let clients: WSClient[] = []

    wss.on('connection', (ws: WebSocket) => {
        const client = new WSClient(ws)
        clients.push(client)
        ws.on('pong', () => {
            client.isAlive = true
        })
        ws.on('close', () => {
            const index = clients.indexOf(client)
            clients.splice(index, 1)
        })
    })

    app.post('/', express.json({ type: '*/*' }), async (req, res) => {
        const fileName = path.basename(req.body.FileName)
        const file = files.find(file => path.basename(file.file) === fileName)
        if (file) {
            if (req.body.Timestamp && !file.timestamps.includes(req.body.Timestamp)) {
                file.timestamps.push(req.body.Timestamp)
                await updateFiles()
            }
            res.status(200).send(null)
            return
        }
        const filePath = await searchForFile(req.body.FileName)
        if (filePath == null) {
            res.status(404).send(null)
            return
        }
        ffmpegCommand.ffprobe(filePath, async (err, data) => {
            if (err) {
                console.log(err)
                res.status(500).send(null)
                return
            }
            const firstVideoStream = data.streams.find(stream => stream.codec_type === 'video')
            const firstAudioStream = data.streams.find(stream => stream.codec_type === 'audio')
            files.push({
                file: filePath,
                timestamps: req.body.Timestamp ? [req.body.Timestamp] : [],
                videoInfo: {
                    duration: data.format.duration || 1,
                    width: firstVideoStream?.width || 0,
                    height: firstVideoStream?.height || 0,
                    fps: parseFramerate(firstVideoStream?.r_frame_rate ?? '0/1'),
                    audioCodec: firstAudioStream?.codec_name ?? '',
                    videoCodec: firstVideoStream?.codec_name ?? '',
                    size: data.format.size || 0
                },
                generationTask: undefined
            })

            await updateFiles()

            res.status(200).send(null)
        })
    })

    app.post('/generate', async (req, res) => {
        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            if (file.generationTask && file.generationTask.state === 'running') {
                continue
            }
            
            file.generationTask = generateTask(file, onProgressUpdate)
            addTask(file.generationTask)
        }
        broadcastMessage({
            type: 'tasksUpdated'
        })
        res.status(200).send(null)
    })

    app.get('/files', (req, res) => {
        res.status(200).send(files.map(file => ({
            file: file.file,
            timestamps: file.timestamps,
            taskId: file.generationTask?.id,
            taskStatus: {
                state: file.generationTask?.state || null,
                progress: file.generationTask?.progress || 0
            }
        })))
    })

    app.delete('/file/:file', async (req, res) => {
        const fileIndex = files.findIndex(file => file.file === req.params.file)
        if (fileIndex === -1) {
            res.status(404).send(null)
            return
        }
        files.splice(fileIndex, 1)
        updateFiles()
        res.status(200).send(null)
    })

    app.delete('/files', (req, res) => {
        files = []
        updateFiles()
        res.status(200).send(null)
    })

    app.delete('/file/:file/timestamp/:timestamp', (req, res) => {
        const file = files.find(file => file.file === req.params.file)
        if (!file) {
            res.status(404).send(null)
            return
        }
        const timestampIndex = file.timestamps.indexOf(+req.params.timestamp)
        if (timestampIndex === -1) {
            res.status(404).send(null)
            return
        }
        file.timestamps.splice(timestampIndex, 1)
        updateFiles()
        res.status(200).send(null)
    })

    app.get('/tasks', (req, res) => {
        res.status(200).send(tasksQueue.map(task => ({
            id: task.id,
            state: task.state,
            progress: task.progress,
            error: task.error,
            fileName: task.videoInfo.name
        })))
    })

    app.delete('/task/:task', (req, res) => {
        const taskIndex = tasksQueue.findIndex(task => task.id === +req.params.task)
        if (taskIndex === -1) {
            res.status(404).send(null)
            return
        }
        tasksQueue.splice(taskIndex, 1)
        broadcastMessage({
            type: 'tasksUpdated'
        })
        res.status(200).send(null)
    })

    app.post('/tasks/clear', (req, res) => {
        tasksQueue = tasksQueue.filter(task => task.state === 'pending' || task.state === 'running')
        broadcastMessage({
            type: 'tasksUpdated'
        })
        res.status(200).send(null)
    })

    app.get('/task/:task/result', (req, res) => {
        const task = tasksQueue.find(task => task.id === +req.params.task)
        if (!task) {
            res.status(404).send(null)
            return
        }
        res.status(200).send(task.output)
    })

    app.use(express.static(config.frontEndLocation))

    server.listen(config.port, () => {
        console.log(`Server listening on port ${config.port}`)

        setInterval(() => {
            let deadClients: WSClient[] = []
            for (let client of clients) {
                if (!client.isAlive) {
                    deadClients.push(client)
                    continue
                }

                client.isAlive = false
                client.ws.ping(null, false)
            }

            console.log(`${deadClients.length} dead clients out of ${clients.length}`)

            for (let client of deadClients) {
                const index = clients.indexOf(client)
                clients.splice(index, 1)
            }
        }, 10000)
    })

    function generateTask(file: VcsFile, progressUpdate: (task: VcsGenerationTask) => void = () => {}): VcsGenerationTask {
        const task = new VcsGenerationTask({
            background: config.background,
            textColor: config.textColor,
            borderColor: config.borderColor,
            textShadow: config.textShadow,
            font: config.font,
            thumbnailsPadding: config.thumbnailsPadding,
            thumbnailsMargin: config.thumbnailsMargin,
            thumbnailsBorder: config.thumbnailsBorder,
            thumbnailsSize: config.thumbnailsSize,
            columns: config.columns,
            rows: config.rows,
            timestamps: file.timestamps,
            videoInfo: {
                duration: file.videoInfo.duration,
                width: file.videoInfo.width,
                height: file.videoInfo.height,
                fps: file.videoInfo.fps,
                audioCodec: file.videoInfo.audioCodec,
                videoCodec: file.videoInfo.videoCodec,
                name: path.basename(file.file),
                path: file.file,
                size: file.videoInfo.size
            },
            outputPath: path.join(path.dirname(file.file), `${path.basename(file.file)}.png`),
            progressUpdate
        })
        return task
    }

    function addTask(task: VcsGenerationTask) {
        tasksQueue.push(task)
        if (queueRunning) {
            return
        }
        const nextTask = tasksQueue.find(task => task.state === 'pending')
        if (nextTask) {
            queueRunning = true
            nextTask?.run()
        }
    }
    
    function onProgressUpdate(task: VcsGenerationTask) {
        if (task.state === 'finished') {
            const nextTask = tasksQueue.find(task => task.state === 'pending')
            if (nextTask) {
                nextTask.run()
            } else {
                queueRunning = false
            }
        }

        broadcastMessage({
            type: 'progress',
            taskId: task.id,
            progress: task.progress,
            state: task.state,
            error: task.error
        })
    }

    function broadcastMessage(message: any) {
        for (let client of clients) {
            client.ws.send(JSON.stringify(message))
        }
    }

    async function updateFiles() {
        if (config.autosaveFilesLocation) {
            try {
                fs.writeFile(config.autosaveFilesLocation, JSON.stringify(files))
            } catch (err) {
                console.error(err)
            }
        }
        broadcastMessage({
            type: 'filesUpdated'
        })
    }

    async function loadFiles() {
        if (config.autosaveFilesLocation) {
            try {
                const data = await fs.readFile(config.autosaveFilesLocation, { encoding: 'utf8' })
                files = JSON.parse(data.toString())
            } catch (err) {
                console.error(err)
            }
        }
    }

    async function searchForFile(file: string) {
        const fileName = path.basename(file)
        try {
            await fs.access(file, fs.constants.R_OK)
            return file
        } catch (err) { }
        if (config.searchFileDirectories) {
            console.log(`searching for ${fileName}`)
            for (let i = 0; i < config.searchFileDirectories.length; i++) {
                const dir = config.searchFileDirectories[i]
                const result = await searchInDirectory(dir, 0)
                if (result) {
                    return result
                }
            }
        }

        console.log(`File not found ${fileName}`)
        return null

        async function searchInDirectory(lpath: string, depth: number) {
            if (config.searchFileDepth && depth > config.searchFileDepth) {
                return null
            }

            const dirDataArr = await fs.readdir(lpath, { withFileTypes: true })
            const files = dirDataArr.filter(dirent => dirent.isFile())
            for (let i = 0; i < files.length; i++) {
                const dirent = files[i]
                if (dirent.name === fileName) {
                    return path.join(lpath, dirent.name)
                }
            }

            const dirs = dirDataArr.filter(dirent => dirent.isDirectory())
            for (let i = 0; i < dirs.length; i++) {
                const dirent = dirs[i]
                const result = await searchInDirectory(path.join(lpath, dirent.name), depth + 1)
                if (result) {
                    return result
                }
            }
        }
    }
}

main()

class WSClient {
    ws: WebSocket
    isAlive: boolean
    constructor(ws: WebSocket) {
        this.ws = ws
        this.isAlive = true
    }
}

let currentTaskId = 0

class VcsGenerationTask {
    progress: number = 0
    state: 'pending' | 'running' | 'finished' | 'error' = 'pending'
    error: string | null = null
    id: number
    
    output: Buffer | null
    outputPath: string
    progressUpdate: (task: VcsGenerationTask) => void

    background: string
    textColor: string
    borderColor: string
    textShadow: string
    font: string
    thumbnailsPadding: number
    thumbnailsMargin: number
    thumbnailsBorder: number
    thumbnailsSize: number
    columns: number
    rows: number
    timestamps: number[]

    videoInfo: {
        duration: number
        width: number
        height: number
        fps: number
        videoCodec: string
        audioCodec: string
        size: number
        name: string
        path: string
    }

    constructor(options: {
        background: string
        textColor: string
        borderColor: string
        textShadow: string
        font: string
        thumbnailsPadding: number
        thumbnailsMargin: number
        thumbnailsBorder: number
        thumbnailsSize: number
        columns: number
        rows: number,
        timestamps: number[],
        videoInfo: {
            duration: number
            width: number
            height: number
            fps: number
            videoCodec: string
            audioCodec: string
            size: number
            name: string
            path: string
        },
        outputPath: string
        progressUpdate: (task: VcsGenerationTask) => void,
    }) {
        this.background = options.background
        this.textColor = options.textColor
        this.borderColor = options.borderColor
        this.textShadow = options.textShadow
        this.font = options.font
        this.thumbnailsPadding = options.thumbnailsPadding
        this.thumbnailsMargin = options.thumbnailsMargin
        this.thumbnailsBorder = options.thumbnailsBorder
        this.thumbnailsSize = options.thumbnailsSize
        this.columns = options.columns
        this.rows = options.rows
        this.timestamps = options.timestamps.slice()
        this.videoInfo = { ...options.videoInfo }
        this.progressUpdate = options.progressUpdate
        this.output = null
        this.outputPath = options.outputPath
        this.id = currentTaskId++
    }

    async run() {
        this.state = 'running'
        this.progressUpdate(this)

        if (this.timestamps.length > this.columns * this.rows) {
            this.state = 'error'
            this.error = 'More highlights than thumbnails'
            return
        }

        try {
            const timestamps = getTimestamps(this.columns * this.rows, this.videoInfo.duration, this.timestamps)
    
            const thumbnails: canvas.Canvas[] = []
            let completedTasks = 0
            let incrementTasks = () => {
                completedTasks++
                this.progress = (completedTasks + 1) / timestamps.length * 0.5
                this.progressUpdate(this)
            }
            let tasks: (() => Promise<void>)[] = []
            const start = performance.now()
            for (let i = 0; i < timestamps.length; i++) {
                tasks.push(async.asyncify(async () => {
                    const timestamp = timestamps[i]
                    const img = await extractScreenshot(this.videoInfo.path, timestamp)
                    thumbnails[i] = (await prepareThumbnail(img, {
                        thumbnailSize: this.thumbnailsSize,
                        thumbnailPadding: this.thumbnailsPadding,
                        thumbnailBorder: this.thumbnailsBorder,
                        thumbnailBorderColor: this.borderColor,
                        timestamp: secondsToTimestamp(timestamp, { noMillis: true, alwaysHours: timestamps[timestamps.length - 1] > 3600, alwaysMinutes: timestamps[timestamps.length - 1] > 60 }),
                        textColor: this.textColor,
                        textShadow: this.textShadow,
                        font: this.font
                    }))
                    incrementTasks()
                }))
            }
            await async.parallelLimit(tasks, 4)
            console.log(`Took ${performance.now() - start} ms to extract screenshots`)
    
            const vcs = await generateVcs({
                images: thumbnails,
                columns: this.columns,
                rows: this.rows,
                thumbnailsMargin: this.thumbnailsMargin,
                thumbnailsPadding: this.thumbnailsPadding,
                thumbnailsBorder: this.thumbnailsBorder,
                background: this.background,
                textColor: this.textColor,
                textShadow: this.textShadow,
                videoInfo: `${this.videoInfo.name}
${secondsToTimestamp(this.videoInfo.duration, { noMillis: true })}, ${sizeToString(this.videoInfo.size)}
${this.videoInfo.videoCodec}, ${this.videoInfo.audioCodec}
${this.videoInfo.width} x ${this.videoInfo.height}, ${this.videoInfo.fps} fps`,
                progressUpdate: (progress) => {
                    this.progress = 0.5 + progress * 0.5
                    this.progressUpdate(this)
                },
                font: this.font
            })
    
            await (new Promise<void>((resolve) =>  {
                vcs.toBuffer((err, buf) => {
                    if (err) {
                        this.state = 'error'
                        this.error = err.message
                        return
                    }

                    this.output = buf
        
                    resolve(fs.writeFile(this.outputPath, buf))
                }, 'image/png')
            }))
            this.state = 'finished'
            this.progress = 1
            this.progressUpdate(this)
        } catch (err: any) {
            this.state = 'error'
            this.error = err.stack
        }
    }
}

function parseFramerate(framerate: string) {
    const match = framerate.match(/^(\d+)\/(\d+)$/)
    if (match) {
        return parseInt(match[1]) / parseInt(match[2])
    }

    return parseFloat(framerate)
}

function sizeToString(bytes: number) {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    if (bytes == 0) return '0 B'
    const i = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1000)), sizes.length - 1)
    return parseFloat((bytes / Math.pow(1000, i)).toFixed(2)) + ' ' + sizes[i]
}
