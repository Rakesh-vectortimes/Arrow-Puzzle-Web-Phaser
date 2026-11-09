import { AUTO, Game, Scale } from 'phaser';
import { fitGame, pixelRatio } from './screen';
import { Boot } from './scenes/Boot';
import { HomeScene } from './scenes/HomeScene';
import { LevelsScene } from './scenes/LevelsScene';
import { PlayScene } from './scenes/PlayScene';

const ratio = pixelRatio();

const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    parent: 'game-container',
    backgroundColor: '#f4f7fb',
    banner: false,
    scale: {
        mode: Scale.NONE,
        autoCenter: Scale.CENTER_BOTH,
        width: Math.max(1, Math.round(window.innerWidth * ratio)),
        height: Math.max(1, Math.round(window.innerHeight * ratio)),
    },
    scene: [Boot, HomeScene, LevelsScene, PlayScene],
    input: {
        activePointers: 3,
    },
    render: {
        // Textures (the UI labels) stay on nearest filtering so type stays crisp.
        // antialiasGL keeps the arrow strokes smooth.
        antialias: false,
        antialiasGL: true,
        roundPixels: true,
        powerPreference: 'high-performance',
    },
};

const StartGame = (parent: string) => {
    const game = new Game({ ...config, parent });
    const fit = () => fitGame(game);
    fit();
    game.scale.on('resize', fit);
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    window.visualViewport?.addEventListener('resize', fit);
    const parentEl = document.getElementById(parent);
    if (parentEl && typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => fit());
        observer.observe(parentEl);
    }
    return game;
};

export default StartGame;
