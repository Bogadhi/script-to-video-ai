import React from 'react';
import { AbsoluteFill, Audio, Img, Video, interpolate, useCurrentFrame } from 'remotion';

interface SceneProps {
    imagePath: string | null;
    videoPath?: string | null;
    audioPath: string;
    durationInFrames: number;
    motion?: {
        startScale?: number;
        endScale?: number;
        xStart?: number;
        xEnd?: number;
        yStart?: number;
        yEnd?: number;
    };
}

export const Scene: React.FC<SceneProps> = ({
    imagePath,
    videoPath,
    audioPath,
    durationInFrames,
    motion,
}) => {
    const frame = useCurrentFrame();
    const isMediaSource = (url?: string | null) =>
        typeof url === 'string' && url.trim().length > 0;

    const safeVideoPath = isMediaSource(videoPath) ? videoPath : null;
    const safeImagePath = !safeVideoPath && isMediaSource(imagePath) ? imagePath : null;
    const safeAudioPath = isMediaSource(audioPath) ? audioPath : '';
    const safeDurationInFrames = Math.max(1, durationInFrames ?? 90);
    const safeMotion = {
        startScale: motion?.startScale ?? 1,
        endScale: motion?.endScale ?? 1.1,
        xStart: motion?.xStart ?? 0,
        xEnd: motion?.xEnd ?? 12,
        yStart: motion?.yStart ?? 0,
        yEnd: motion?.yEnd ?? -8,
    };

    const scale = interpolate(
        frame,
        [0, safeDurationInFrames],
        [safeMotion.startScale, safeMotion.endScale],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const translateX = interpolate(
        frame,
        [0, safeDurationInFrames],
        [safeMotion.xStart, safeMotion.xEnd],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    const translateY = interpolate(
        frame,
        [0, safeDurationInFrames],
        [safeMotion.yStart, safeMotion.yEnd],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return (
        <AbsoluteFill style={{ backgroundColor: 'black' }}>
            {safeVideoPath ? (
                <Video
                    src={safeVideoPath}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                />
            ) : safeImagePath ? (
                <Img
                    src={safeImagePath}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
                    }}
                />
            ) : null}

            {safeAudioPath ? <Audio src={safeAudioPath} /> : null}
        </AbsoluteFill>
    );
};
