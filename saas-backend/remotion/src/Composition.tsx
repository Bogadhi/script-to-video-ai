import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Scene } from './Scene';

interface SceneMotion {
    startScale?: number;
    endScale?: number;
    xStart?: number;
    xEnd?: number;
    yStart?: number;
    yEnd?: number;
}

interface SceneData {
    scene_id: number;
    image_path: string | null;
    video_path?: string | null;
    audio_path: string;
    duration: number;
    motion?: SceneMotion;
}

interface MainProps {
    scenes: SceneData[];
    musicPath: string;
}

const FadeTransition: React.FC<{
    children: React.ReactNode;
    durationInFrames: number;
}> = ({ children, durationInFrames }) => {
    const frame = useCurrentFrame();
    const tenPercent = Math.max(1, Math.floor(durationInFrames * 0.1));

    const opacity = interpolate(
        frame,
        [0, tenPercent, durationInFrames - tenPercent, durationInFrames],
        [0, 1, 1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const Main: React.FC<MainProps> = ({ scenes, musicPath }) => {
    const { fps } = useVideoConfig();

    const isMediaSource = (url?: string | null) =>
        typeof url === 'string' && url.trim().length > 0;
    const blankImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGBgAAAABAABJwc5IQAAAABJRU5ErkJggg==';
    console.log('RENDER SCENES COUNT:', scenes?.length ?? 0);

    const safeScenes = (scenes ?? []).map((scene, index) => {
        const duration = typeof scene?.duration === 'number' && scene.duration > 0
            ? scene.duration
            : 3;
        const videoPath = isMediaSource(scene?.video_path) ? scene.video_path : null;
        const imagePath = isMediaSource(scene?.image_path) ? scene.image_path : blankImage;

        return {
            scene_id: scene?.scene_id ?? index,
            image_path: videoPath ? null : imagePath,
            video_path: videoPath,
            audio_path: isMediaSource(scene?.audio_path) ? scene.audio_path : '',
            duration,
            motion: {
                startScale: scene?.motion?.startScale ?? 1,
                endScale: scene?.motion?.endScale ?? 1.1,
                xStart: scene?.motion?.xStart ?? 0,
                xEnd: scene?.motion?.xEnd ?? 10,
                yStart: scene?.motion?.yStart ?? 0,
                yEnd: scene?.motion?.yEnd ?? -6,
            },
        };
    });

    const safeMusicPath = isMediaSource(musicPath) ? musicPath : undefined;
    
    // REPLACE ANY HARDCODE duration AND totalDuration
    const totalDurationFrames = safeScenes.reduce((sum, s) => {
        return sum + Math.floor((s.duration || 3) * fps);
    }, 0);

    if (safeScenes.length === 0) {
        return <AbsoluteFill style={{ backgroundColor: 'black' }} />;
    }

    let currentFrame = 0;

    return (
        <AbsoluteFill>
            {safeMusicPath ? <Audio src={safeMusicPath} startFrom={0} endAt={totalDurationFrames} /> : null}

            {safeScenes.map((scene, index) => {
                const frames = Math.floor((scene.duration || 3) * fps);
                const from = currentFrame;

                const sequenceBlock = (
                    <Sequence key={`scene-${scene.scene_id}-${index}`} from={from} durationInFrames={frames}>
                        <FadeTransition durationInFrames={frames}>
                            <Scene
                                imagePath={scene.image_path}
                                videoPath={scene.video_path}
                                audioPath={scene.audio_path}
                                durationInFrames={frames}
                                motion={scene.motion}
                            />
                        </FadeTransition>
                    </Sequence>
                );

                currentFrame += frames;
                return sequenceBlock;
            })}
        </AbsoluteFill>
    );
};
