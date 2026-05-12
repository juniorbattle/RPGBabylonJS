
import { ClanManager } from '../data/ClanManager';
import { DataManager } from '../data/DataManager';
import { ClanUI } from './ClanUI';
import { InventoryUI } from './InventoryUI';
import { ShopUI } from './ShopUI';
import { JournalUI } from './JournalUI';
import { SaveSystem } from '../data/SaveSystem';
import { ModalUI } from './ModalUI';

export enum MenuTab {
    CLAN = 'clan',
    INVENTORY = 'inventory',
    JOURNAL = 'journal',
    SYSTEM = 'system',
    SHOP = 'shop'
}

export class MenuManager {
    private static instance: MenuManager;
    private root: HTMLElement;
    private currentTab: MenuTab | null = null;
    private activeContext: 'clan' | 'shop' | 'system' = 'clan';
    private shopItems: any[] = [];
    private goldValueEl: HTMLElement | null = null;

    private constructor() {
        this.root = document.getElementById('ui-overlay-root') as HTMLElement;
    }

    public static getInstance(): MenuManager {
        if (!MenuManager.instance) MenuManager.instance = new MenuManager();
        return MenuManager.instance;
    }

    public openClanMenu(tab: MenuTab = MenuTab.CLAN): void {
        this.activeContext = 'clan';
        this.show(tab);
    }

    public openShopMenu(availableItems: any[]): void {
        this.activeContext = 'shop';
        this.shopItems = availableItems;
        this.show(MenuTab.SHOP);
    }

    public openSystemMenu(): void {
        this.activeContext = 'system';
        this.show(MenuTab.SYSTEM);
    }

    private show(tab: MenuTab): void {
        this.root.classList.add('active');
        this.renderLayout(tab);
    }

    public hide(): void {
        this.root.classList.remove('active');
        this.root.innerHTML = '';
        this.currentTab = null;
    }

    private renderLayout(activeTab: MenuTab): void {
        this.currentTab = activeTab;
        this.root.innerHTML = `
            <div class="t-layout">
                <!-- Header -->
                <div class="t-header">
                    <div class="t-gold-pill">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--t-gold); display: flex; align-items: center; justify-content: center; font-size: 16px;">🪙</div>
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 9px; font-weight: 900; color: var(--t-text-dim); text-transform: uppercase;">Or disponible</span>
                            <span id="t-menu-gold-value" style="font-size: 18px; font-weight: 900; color: var(--t-gold);">${ClanManager.getInstance().getGold()}</span>
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 20px;">
                        <div class="t-nav-group">
                            ${this.renderNavButtons(activeTab)}
                        </div>
                        
                        <button id="menu-close-btn" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: var(--t-red); padding: 12px 20px; border-radius: 12px; font-size: 12px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s;">
                            <span>✕</span> FERMER
                        </button>
                    </div>
                </div>

                <!-- Content Area -->
                <div id="t-menu-content-host" style="width: 100%; height: 100%; overflow: hidden;">
                </div>
            </div>
        `;

        document.getElementById('menu-close-btn')?.addEventListener('click', () => this.hide());
        this.goldValueEl = document.getElementById('t-menu-gold-value');
        this.attachNavEvents();
        this.renderTabContent(activeTab);
    }

    public refreshGoldDisplay(): void {
        const gold = ClanManager.getInstance().getGold();
        if (this.goldValueEl) {
            this.goldValueEl.textContent = gold.toString();
        }
        // Also refresh any active UI that might need it
        // Note: ShopUI usually calls its own render() which fetches gold locally,
        // but it doesn't hurt.
    }

    private renderNavButtons(activeTab: MenuTab): string {
        const tabs = [];
        if (this.activeContext === 'clan') {
            tabs.push({ id: MenuTab.CLAN, icon: '👥', label: 'Clan' });
            tabs.push({ id: MenuTab.INVENTORY, icon: '🎒', label: 'Inventaire' });
            tabs.push({ id: MenuTab.JOURNAL, icon: '📜', label: 'Journal' });
        } else if (this.activeContext === 'shop') {
            tabs.push({ id: MenuTab.SHOP, icon: '🛒', label: 'Boutique' });
        } else {
            tabs.push({ id: MenuTab.SYSTEM, icon: '⚙️', label: 'Système' });
        }

        return tabs.map(t => `
            <button class="t-nav-btn ${activeTab === t.id ? 'active' : ''}" 
                    data-tab="${t.id}"
                    style="background: ${activeTab === t.id ? 'var(--t-blue)' : 'transparent'}; 
                           border: none; 
                           color: ${activeTab === t.id ? 'white' : 'var(--t-text-muted)'}; 
                           padding: 10px 20px; 
                           border-radius: 10px; 
                           font-size: 12px; 
                           font-weight: 800; 
                           cursor: pointer; 
                           display: flex; 
                           align-items: center; 
                           gap: 8px; 
                           transition: 0.2s;
                           ${activeTab === t.id ? 'box-shadow: 0 4px 15px var(--t-blue-glow);' : ''}">
                <span style="font-size: 16px;">${t.icon}</span> ${t.label.toUpperCase()}
            </button>
        `).join('');
    }

    private attachNavEvents(): void {
        this.root.querySelectorAll('.t-nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = (e.currentTarget as HTMLElement).dataset.tab as MenuTab;
                if (tab !== this.currentTab) this.renderLayout(tab);
            });
        });
    }

    private renderTabContent(tab: MenuTab): void {
        const host = document.getElementById('t-menu-content-host');
        if (!host) return;

        switch (tab) {
            case MenuTab.CLAN:
                new ClanUI(host).render();
                break;
            case MenuTab.INVENTORY:
                new InventoryUI(host).render();
                break;
            case MenuTab.JOURNAL:
                new JournalUI(host);
                break;
            case MenuTab.SHOP:
                new ShopUI(host, this.shopItems).render();
                break;
            case MenuTab.SYSTEM:
                this.renderSystem(host);
                break;
        }
    }

    private renderSystem(host: HTMLElement): void {
        const hasSave = SaveSystem.hasSave(1);
        
        const btnStyle = (bg: string, glow: string) => `
            width: 300px; padding: 18px; font-size: 16px; font-weight: 800; letter-spacing: 0.5px;
            background: ${bg}; color: white; border: none; border-radius: 12px;
            cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 12px;
            box-shadow: 0 4px 15px ${glow}; transition: transform 0.1s, box-shadow 0.2s;
        `;

        const disabledStyle = `
            width: 300px; padding: 18px; font-size: 16px; font-weight: 800;
            background: #1e293b; color: #475569; border: 1px solid #334155; border-radius: 12px;
            cursor: not-allowed; display: flex; align-items: center; justify-content: center; gap: 12px;
            box-shadow: none; opacity: 0.6;
        `;

        host.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 24px;">
                
                <!-- SAVE: Blue (Primary Action) -->
                <button id="btn-save" style="${btnStyle('linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', 'rgba(37, 99, 235, 0.4)')}">
                    <span style="font-size: 20px;">💾</span> 
                    <span>SAUVEGARDER</span>
                </button>

                <!-- LOAD: Amber/Gold (Secondary/History Action) - Distinct form Confirm Blue -->
                <button id="btn-load" ${!hasSave ? 'disabled' : ''} style="${hasSave ? btnStyle('linear-gradient(135deg, #fbbf24 0%, #d97706 100%)', 'rgba(217, 119, 6, 0.4)') : disabledStyle}">
                    <span style="font-size: 20px;">📂</span> 
                    <span>CHARGER</span>
                </button>

                <!-- QUIT: Red (Danger Action) -->
                <button id="btn-quit" style="${btnStyle('linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', 'rgba(220, 38, 38, 0.4)')}">
                    <span style="font-size: 20px;">🚪</span> 
                    <span>QUITTER</span>
                </button>

            </div>
        `;
        
        // Add hover transform via JS delegation
        host.querySelectorAll('button:not([disabled])').forEach(btn => {
            btn.addEventListener('mouseenter', () => (btn as HTMLElement).style.transform = 'translateY(-2px)');
            btn.addEventListener('mouseleave', () => (btn as HTMLElement).style.transform = 'translateY(0)');
            btn.addEventListener('mousedown', () => (btn as HTMLElement).style.transform = 'translateY(1px)');
            btn.addEventListener('mouseup', () => (btn as HTMLElement).style.transform = 'translateY(-2px)');
        });

        document.getElementById('btn-save')?.addEventListener('click', () => {
            ModalUI.showConfirm(
                "SAUVEGARDER",
                "Cela écrasera votre sauvegarde précédente. Continuer ?",
                async () => {
                    await ModalUI.showLoader("Sauvegarde en cours...", 3000);
                    
                    SaveSystem.saveGame(1);
                    ModalUI.showToast("Sauvegarde réussie !");

                    // Enable Load Button immediately
                    const loadBtn = document.getElementById('btn-load') as HTMLButtonElement;
                    if (loadBtn) {
                        loadBtn.disabled = false;
                        loadBtn.style.background = 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)';
                        loadBtn.style.color = 'white';
                        loadBtn.style.cursor = 'pointer';
                        loadBtn.style.opacity = '1';
                        loadBtn.style.boxShadow = '0 4px 15px rgba(217, 119, 6, 0.4)';
                        loadBtn.style.border = 'none';
                        
                        // Re-attach hover logic if needed, but CSS transform is safer handled by class or global listener
                        // Since global listener targets button:not([disabled]), it will work automatically now that disabled is removed
                    }
                },
                "CONFIRMER", "ANNULER"
            );
        });

        document.getElementById('btn-load')?.addEventListener('click', () => {
            ModalUI.showConfirm(
                "CHARGER UNE PARTIE",
                "Cette action écrasera votre progression actuelle. Êtes-vous sûr de vouloir continuer ?",
                () => {
                    const success = SaveSystem.loadGame(1);
                    if (!success) {
                        ModalUI.showToast("Erreur lors du chargement", "error");
                    }
                },
                "CHARGER", "ANNULER", true
            );
        });

        document.getElementById('btn-quit')?.addEventListener('click', () => {
            ModalUI.showConfirm(
                "QUITTER LE JEU",
                "Tout progrès non sauvegardé sera perdu. Voulez-vous vraiment quitter ?",
                () => {
                    window.close();
                    document.body.innerHTML = "<div style='display:flex;height:100vh;background:#020617;color:white;align-items:center;justify-content:center;font-family:sans-serif;flex-direction:column;gap:20px'><div style='font-size:64px'>👋</div><h1>Merci d'avoir joué !</h1><p style='color:#94a3b8'>Vous pouvez fermer cette fenêtre.</p></div>";
                },
                "QUITTER", "RESTER", true
            );
        });
    }
}
