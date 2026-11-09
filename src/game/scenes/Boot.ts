import { Scene } from 'phaser';
import { bindAudio } from '../audio';
import { asset, loadCatalog } from '../level';
import { dp } from '../screen';

const CLIPS = ['tap', 'escape', 'wrong', 'level_complete', 'hint', 'button', 'lose'];

export class Boot extends Scene {
    constructor() {
        super('Boot');
    }

    preload(): void {
        for (const clip of CLIPS) {
            this.load.audio(clip, asset(`sfx/${clip}.wav`));
        }
    }

    create(): void {
        this.cameras.main.setBackgroundColor('#f4f7fb');
        bindAudio(this);
        const label = this.add.text(this.scale.width / 2, this.scale.height / 2, 'Arrow Escape', {
            fontFamily: 'Segoe UI, system-ui, sans-serif',
            fontSize: `${dp(28)}px`,
            color: '#24344d',
            fontStyle: 'bold',
        }).setOrigin(0.5);
        void loadCatalog().finally(() => {
            label.destroy();
            if (this.scene.isActive()) this.scene.start('Home');
        });
    }
}
