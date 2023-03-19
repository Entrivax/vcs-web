import ffmpegCommand = require('fluent-ffmpeg')
import Stream = require('stream')
import canvas = require('canvas')

function extractScreenshotData(path: string, timestamp: number): Promise<Buffer> {
    // const inputSeek = Math.max(0, timestamp - 10)
    const buffers: any[] = []
    const stream = new Stream.PassThrough()
    stream.on('data', (chunk) => {
        buffers.push(chunk)
    })
    return new Promise((resolve, reject) => {
        ffmpegCommand(path)
            // .seekInput(inputSeek)
            // .seek(timestamp - inputSeek)
            .seekInput(timestamp)
            .outputFormat('image2') // PNG
            .frames(1)
            .output(stream)
            .on('end', () => {
                resolve(Buffer.concat(buffers))
            })
            .on('error', (err) => {
                if (err.message === 'Output stream closed') {
                    resolve(Buffer.concat(buffers))
                } else {
                    reject(err)
                }
            })
            .run()
    })
}

export async function extractScreenshot(path: string, timestamp: number): Promise<canvas.Image> {
    const buff = await extractScreenshotData(path, timestamp)

    return new Promise<canvas.Image>((resolve, reject) => {
        const img = new canvas.Image()
        img.onload = () => {
            resolve(img)
        }
        img.onerror = (err) => {
            reject(err)
        }
        img.src = buff
    })
}