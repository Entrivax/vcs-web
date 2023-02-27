import { ComponentChildren, h, render, Fragment } from 'preact';
import { useContext, useState } from 'preact/hooks';
import { Router } from 'preact-router';
import { DataContext, DataFile, DataProvider } from './contexts/dataContext';
import { WebSocketProvider } from './contexts/websocketContext';
import { secondsToTimestamp } from './utils/timestamps';
import './style/main.scss'

render(<WebSocketProvider><DataProvider><App /></DataProvider></WebSocketProvider>, document.body)

function App() {
    const dataCtx = useContext(DataContext)
    const [selectedFiles, setSelectedFiles] = useState<string[]>([])

    const selectedFile = selectedFiles.length === 1 ? dataCtx.files?.find(f => f.file === selectedFiles[0]) : null
    const [showTaskResults, setShowTaskResults] = useState<Record<number, boolean>>({})

    function toggleShowTaskResult(taskId: number) {
        setShowTaskResults(showTaskResults => {
            const newShowTaskResults = { ...showTaskResults }
            newShowTaskResults[taskId] = !newShowTaskResults[taskId]
            return newShowTaskResults
        })
    }

    return <>
        <div className="row">
            <div className="col">
                <h2>Files</h2>
                <FileList files={dataCtx.files} selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles} deleteSelected={() => selectedFiles.forEach((f) => dataCtx.deleteFile(f))} />

                {
                    selectedFile && (
                        <div>
                            <h3>Highlights</h3>
                            <HighlightList file={selectedFile} deleteTimestamp={(timestamp: number) => dataCtx.deleteTimestamp(selectedFile.file, timestamp)} />
                        </div>
                    )
                }
                <div>
                    <button onClick={() => dataCtx.triggerGeneration()}>Generate</button>
                </div>
            </div>
            <div className="col task-col">
                <div>
                    <button className="float-right" onClick={() => dataCtx.clearFinishedTasks()}>Clear finished tasks</button>
                    <h2>Tasks</h2>
                </div>
                <div className="task-list">
                    {dataCtx.tasks?.map(task => <div className="task">
                        <div className="task-progress" data-state={task.state} style={`--progress: ${task.progress * 100}`} onClick={() => toggleShowTaskResult(task.id)}>
                            <div className="task-progress-bar"></div>
                            <div className="task-progress-name">
                                {task.fileName}
                            </div>
                        </div>
                        { showTaskResults[task.id] && task.state === 'finished' && <img className="task-result" src={`/task/${task.id}/result`} />}
                    </div>)}
                </div>
            </div>
        </div>
    </>
}


function FileList({ files, selectedFiles, setSelectedFiles, deleteSelected }: { files: DataFile[] | null, selectedFiles: string[], setSelectedFiles: (files: string[]) => void, deleteSelected: () => void }) {
    return <select className="" multiple onInput={(ev) => setSelectedFiles(
        (Array.from(ev.currentTarget.selectedOptions)
            .map(opt => files?.find(f => f.file === opt.value))
            .filter(f => f !== undefined) as DataFile[])
            .map(f => f.file)
    )} onKeyDown={(ev) => (ev.key === 'Escape' && setSelectedFiles([])) || (ev.key === 'Delete' && deleteSelected() )}>
        {files?.map(file => <option value={file.file} selected={selectedFiles.includes(file.file)}>{file.file}</option>)}
    </select>
}

function HighlightList({ file, deleteTimestamp }: { file: DataFile, deleteTimestamp: (timestamp: number) => void }) {
    return <select onKeyDown={(ev) => ev.key === 'Delete' && deleteTimestamp(+ev.currentTarget.value)} size={5}>
        {file.timestamps.map(timestamp => <option value={timestamp}>{secondsToTimestamp(timestamp, {})}</option>)}
    </select>
}