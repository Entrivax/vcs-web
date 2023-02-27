import { ComponentChildren, Context, createContext, h } from "preact";
import { useState, useRef, useEffect, MutableRef } from "preact/hooks";

export const WebSocketContext = createContext<{
    isReady: boolean,
    message: any,
    send: ((data: string | ArrayBufferLike | Blob | ArrayBufferView) => void) | undefined
}>({ isReady: false, message: null, send: undefined })

export const WebSocketProvider = ({ children }: { children: ComponentChildren }) => {
    const [isReady, setIsReady] = useState(false);
    const [message, setMessage] = useState(null);

    const ws: MutableRef<WebSocket | null> = useRef(null);

    useEffect(() => {
        const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/}`);

        socket.onopen = () => setIsReady(true);
        socket.onclose = () => setIsReady(false);
        socket.onmessage = (event) => {
            const message = { ...JSON.parse(event.data), __messageKey: Math.random() }
            setMessage(message)
            console.log(`message set to`, message)
        };

        ws.current = socket;

        return () => {
            socket.close();
        };
    }, []);

    const ret = { isReady, message, send: ws.current?.send.bind(ws.current) };

    return (
        <WebSocketContext.Provider value={ret} children={children}/>
    );
}