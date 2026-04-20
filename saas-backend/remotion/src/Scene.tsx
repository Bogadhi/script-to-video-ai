import React from 'react';
import { AbsoluteFill, Audio, Img, Video, interpolate, useCurrentFrame } from 'remotion';

interface SceneProps {
    imagePath: string | null;
    videoPath?: string | null;
    audioPath: string;
    durationInFrames: number;
    composition?: string;
    storyRole?: string;
    shotType?: string;
    showWatermark?: boolean;
    watermarkText?: string;
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
    composition,
    storyRole,
    shotType,
    showWatermark,
    watermarkText,
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

            {showWatermark ? (
                <AbsoluteFill
                    style={{
                        justifyContent: 'flex-end',
                        alignItems: 'flex-end',
                        padding: 36,
                        pointerEvents: 'none',
                    }}
                >
                    <div
                        style={{
                            fontFamily: 'Georgia, serif',
                            fontSize: 28,
                            letterSpacing: 1.5,
                            color: 'rgba(255,255,255,0.78)',
                            textTransform: 'uppercase',
                            background: 'rgba(0,0,0,0.28)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            padding: '10px 14px',
                            backdropFilter: 'blur(8px)',
                        }}
                    >
                        {watermarkText || 'Bogadhi Free'}
                    </div>
                </AbsoluteFill>
            ) : null}
        </AbsoluteFill>
    );
};
