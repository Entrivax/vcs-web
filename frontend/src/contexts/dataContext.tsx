import { ComponentChildren, Context, createContext, h } from "preact";
import { useState, useRef, useEffect, MutableRef, useContext } from "preact/hooks";
import { WebSocketContext, WebSocketProvider } from "./websocketContext";

export interface DataFile {
    file: string
    timestamps: number[]
    taskStatus: {
        state: string
        progress: number
    }
}

export interface DataTask {
    id: number
    fileName: string
    state: string
    progress: number
}

export const DataContext = createContext<{
    files: DataFile[] | null
    tasks: DataTask[] | null
    triggerGeneration: () => Promise<Response>
    deleteTimestamp: (file: string, timestamp: number) => Promise<Response>
    clearFinishedTasks: () => Promise<Response>
    clearFiles: () => Promise<Response>
    deleteFile: (file: string) => Promise<Response>
}>({ files: null, tasks: null, triggerGeneration: () => { throw new Error('Not implemented') }, deleteTimestamp: () => { throw new Error('Not implemented') }, clearFinishedTasks: () => { throw new Error('Not implemented') }, clearFiles: () => { throw new Error('Not implemented') }, deleteFile: () => { throw new Error('Not implemented')} })

export const DataProvider = ({ children }: { children: ComponentChildren }) => {
    const [files, setFiles] = useState<DataFile[] | null>(null);
    const [tasks, setTasks] = useState<DataTask[] | null>(null);
    const [fetchRequests, setFetchRequests] = useState<Record<string, Promise<unknown> | null>>({})
    const { message } = useContext(WebSocketContext)

    useEffect(() => {
        if (message) {
            switch (message?.type) {
                case 'filesUpdated': {
                    fetchFiles(setFiles)
                    break
                }
                case 'tasksUpdated': {
                    fetchTasks(setTasks)
                    break
                }
                case 'progress': {
                    const { taskId, progress, state } = message
                    setTasks(tasks => {
                        const newTasks = tasks?.map(task => {
                            if (task.id === taskId) {
                                task.progress = progress
                                task.state = state
                            }
                            return task
                        })
                        console.log(newTasks)
                        return newTasks || null
                    })
                }
            }
        }

        console.log(files)
        if (files == null) {
            fetchFiles(setFiles)
        }

        if (tasks == null) {
            fetchTasks(setTasks)
        }

    }, [message])

    const ret = { files, tasks, triggerGeneration, deleteTimestamp, clearFinishedTasks, clearFiles, deleteFile }

    return (
        <DataContext.Provider value={ret} children={children}/>
    )

    function triggerGeneration() {
        return fetch('/generate', { method: 'POST' })
    }

    function deleteTimestamp(file: string, timestamp: number) {
        return fetch(`/file/${encodeURIComponent(file)}/timestamp/${timestamp}`, { method: 'DELETE' })
    }

    function clearFinishedTasks() {
        return fetch('/tasks/clear', { method: 'POST' })
    }

    function clearFiles() {
        return fetch('/files/clear', { method: 'DELETE' })
    }

    function deleteFile(file: string) {
        return fetch(`/file/${encodeURIComponent(file)}`, { method: 'DELETE' })
    }

    function fetchFiles(callback) {
        if (fetchRequests.files) {
            return fetchRequests.files
                .then(callback)
        }
        const request = new Promise((resolve) => {
            setTimeout(() => {
                resolve(
                    fetch('/files')
                        .then(res => res.json())
                        .then((data) => {
                            setFetchRequests(fetchRequests => ({ ...fetchRequests, files: null }))
                            return data
                        })
                )
            }, 100)
        })
        request
            .then(callback)
        setFetchRequests(fetchRequests => ({ ...fetchRequests, files: request }))
        return request
    }

    function fetchTasks(callback) {
        if (fetchRequests.tasks) {
            return fetchRequests.tasks
                .then(callback)
        }
        const request = new Promise((resolve) => {
            setTimeout(() => {
                resolve(
                    fetch('/tasks')
                        .then(res => res.json())
                        .then((data) => {
                            setFetchRequests(fetchRequests => ({ ...fetchRequests, tasks: null }))
                            return data
                        })
                )
            }, 100)
        })
        request
            .then(callback)
        setFetchRequests(fetchRequests => ({ ...fetchRequests, tasks: request }))
        return request
    }
}
