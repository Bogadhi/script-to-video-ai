import React from 'react';
import { Composition } from 'remotion';
import { Main } from './Composition';
import './style.css';

const DEFAULT_FPS = 30;

export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition
                id="CinematicVideo"
                component={Main}
                durationInFrames={300}
                fps={DEFAULT_FPS}
                width={1080}
                height={1920}
                calculateMetadata={({ props }) => {
                    const scenes = Array.isArray(props.scenes) ? props.scenes : [];
                    const durationInFrames = scenes.reduce((total, scene) => {
                        const duration = typeof scene?.duration === 'number' && scene.duration > 0
                            ? scene.duration
                            : 3;
                        return total + Math.max(1, Math.floor(duration * DEFAULT_FPS));
                    }, 0);

                    return {
                        durationInFrames: Math.max(durationInFrames, DEFAULT_FPS * 3),
                    };
                }}
                defaultProps={{
                    scenes: [],
                    musicPath: '',
                    musicStartFrame: 0,
                    watermarkText: 'Bogadhi Free',
                    showWatermark: false,
                }}
            />
        </>
    );
};
