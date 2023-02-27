export function secondsToTimestamp(seconds: number, { noMillis = false, alwaysHours = false, alwaysMinutes = false }: { noMillis?: boolean, alwaysHours?: boolean, alwaysMinutes?: boolean }): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor(seconds / 60) % 60
    const secs = Math.floor(seconds % 60)
    const millis = Math.floor((seconds % 1) * 1000)

    let timestamp = ''

    if (alwaysHours || hours > 0) {
        timestamp += `${hours.toString().padStart(2, '0')}:`
    }

    if (alwaysHours || alwaysMinutes || minutes > 0 || hours > 0) {
        timestamp += `${minutes.toString().padStart(2, '0')}:`
    }

    timestamp += `${secs.toString().padStart(2, '0')}`

    if (!noMillis) {
        timestamp += `.${millis.toString().padStart(3, '0')}`
    }

    return timestamp
}