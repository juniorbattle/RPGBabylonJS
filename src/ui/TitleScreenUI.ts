/**
 * TitleScreenUI.ts
 * Main Menu Entry Point.
 */

import { SaveSystem } from '../data/SaveSystem';
import { SceneManager } from '../SceneManager';
import { DataManager } from '../data/DataManager';
import { GameManager } from '../data/GameManager';
import { ModalUI } from './ModalUI';

export class TitleScreenUI {
    private root: HTMLElement;
    private onStartGame: (isNew: boolean) => void;

    constructor(onStartGame: (isNew: boolean) => void) {
        this.onStartGame = onStartGame;
        this.root = document.createElement('div');
        this.root.id = "title-screen-root";
        this.root.style.cssText = `
            position: fixed; inset: 0; z-index: 9000;
            background: linear-gradient(135deg, #020617 0%, #0f172a 100%);
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            font-family: 'Segoe UI', sans-serif; color: white;
            opacity: 0; transition: opacity 1s ease-in;
        `;
        document.body.appendChild(this.root);
        this.render();
        
        // Fade In
        requestAnimationFrame(() => this.root.style.opacity = '1');
    }

    private render(): void {
        const hasSave = SaveSystem.hasSave(1);

        this.root.innerHTML = `
            <div style="text-align: center; margin-bottom: 60px;">
                <div style="font-size: 80px; margin-bottom: 10px;">🦁</div>
                <h1 style="font-size: 64px; font-weight: 900; margin: 0; letter-spacing: 4px; 
                           background: linear-gradient(to right, #f59e0b, #fbbf24); 
                           -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                    LA VOIE DES SCEAUX
                </h1>
                <p style="font-size: 16px; color: #64748b; letter-spacing: 2px; text-transform: uppercase; margin-top: 10px;">
                    Tactique • Honneur • Destinée
                </p>
            </div>

            <div style="display: flex; flex-direction: column; gap: 20px; widh: 300px;">
                ${hasSave ? `
                    <button id="ts-continue" class="ts-btn primary">
                        <span class="icon">⚔️</span> CONTINUER
                    </button>
                ` : ''}
                
                <button id="ts-new" class="ts-btn ${hasSave ? 'secondary' : 'primary'}">
                    <span class="icon">✨</span> NOUVELLE AVENTURE
                </button>
                
                <button id="ts-quit" class="ts-btn secondary">
                    <span class="icon">🚪</span> QUITTER
                </button>
            </div>

            <div style="position: absolute; bottom: 30px; font-size: 12px; color: #334155;">
                v0.8.2-alpha • WONMII Games
            </div>

            <style>
                .ts-btn {
                    padding: 20px 60px; font-size: 18px; font-weight: 800; border-radius: 12px;
                    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 15px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    width: 380px; text-transform: uppercase; letter-spacing: 1px;
                }
                .ts-btn .icon { font-size: 24px; }
                
                .ts-btn.primary {
                    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                    border: none; color: #fff;
                    box-shadow: 0 10px 30px -10px rgba(245, 158, 11, 0.5);
                }
                .ts-btn.primary:hover {
                    transform: translateY(-3px) scale(1.02);
                    box-shadow: 0 20px 40px -12px rgba(245, 158, 11, 0.7);
                }

                .ts-btn.secondary {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: #94a3b8;
                }
                .ts-btn.secondary:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff; border-color: rgba(255, 255, 255, 0.2);
                    transform: translateY(-2px);
                }
            </style>
        `;

        this.bindEvents();
    }

    private bindEvents(): void {
        const btnContinue = document.getElementById('ts-continue');
        const btnNew = document.getElementById('ts-new');
        const btnQuit = document.getElementById('ts-quit');

        if (btnContinue) {
            btnContinue.onclick = () => this.startGame(false);
        }

        if (btnNew) {
            btnNew.onclick = () => {
                if (SaveSystem.hasSave(1)) {
                    ModalUI.showConfirm(
                        "NOUVELLE AVENTURE",
                        "Une sauvegarde existe déjà. Êtes-vous sûr de vouloir commencer une nouvelle partie ?\nVotre progression précédente sera écrasée lors de la prochaine sauvegarde.",
                        () => this.startGame(true),
                        "COMMENCER", "ANNULER", true
                    );
                } else {
                    this.startGame(true);
                }
            };
        }

        if (btnQuit) {
            btnQuit.onclick = () => window.close();
        }
    }

    private startGame(isNew: boolean): void {
        this.root.style.opacity = '0';
        setTimeout(() => {
            this.root.remove();
            this.onStartGame(isNew);
        }, 1000);
    }
}
