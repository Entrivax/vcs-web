/**
 * Fill the array with evenly spaced values between 0 and "duration" until the array length is count
 */
export function getTimestamps(count: number, duration: number, forcedTimestamps: number[]): number[] {
    const spacing = duration / (count + 1)
    const timestamps = Array(count).fill(0).map((_, i) => spacing * (i + 1))

    const ignoreIndexes: number[] = []
    for (let i = 0; i < forcedTimestamps.length; i++) {
        const index = closestIndex(timestamps, ignoreIndexes, forcedTimestamps[i])
        ignoreIndexes.push(index)
        timestamps[index] = forcedTimestamps[i]
    }
    
    return timestamps.sort((a, b) => a - b)
}


function closestIndex(arr: number[], ignoreIndexes: number[], target: number) {
    let closestDist = Number.MAX_VALUE
    let closestIndex = -1
    for (let i = 0; i < arr.length; i++) {
        // If ignoreIndexes contains i, skip
        if (ignoreIndexes.indexOf(i) !== -1) {
            continue
        }

        const dist = Math.abs(arr[i] - target)
        if (closestDist > dist) {
            closestDist = dist
            closestIndex = i
        }
    }
    return closestIndex
}

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

export function timestampToSeconds(timestamp: string): number {
    const parts = timestamp.split(':')
    const seconds = +parts[parts.length - 1]
    const minutes = +parts[parts.length - 2]
    const hours = +parts[parts.length - 3]
    return seconds + (isNaN(minutes) ? 0 : minutes) * 60 + (isNaN(hours) ? 0 : hours) * 3600
}