import { initPlatform } from './game/bridge';
import StartGame from './game/main';
import { hydrateProgress } from './game/progress';

document.addEventListener('DOMContentLoaded', () => {
    void (async () => {
        await initPlatform();
        await hydrateProgress();
        StartGame('game-container');
    })();
});