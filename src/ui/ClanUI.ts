
import { ClanManager } from '../data/ClanManager';
import { DataManager } from '../data/DataManager';
import { UnitData, StatType } from '../data/types/UnitData';
import { AccessoryModalUI } from './AccessoryModalUI';

export class ClanUI {
    private container: HTMLElement;
    private selectedUnitId: string | null = null;
    private tooltip: HTMLElement | null = null;
    private confirmPopup: HTMLElement | null = null;
    private accessoryModal: AccessoryModalUI;

    constructor(parent: HTMLElement) {
        this.accessoryModal = new AccessoryModalUI(() => this.render());
        this.container = document.createElement('div');
        this.container.className = 't-glass-panel t-animate-fade-up';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.display = 'flex';
        this.createTooltip();
        this.createConfirmPopup();
        parent.appendChild(this.container);
    }

    private createTooltip(): void {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 't-tooltip-popup';
        this.tooltip.style.cssText = `
            position: fixed;
            z-index: 9999;
            background: rgba(15, 20, 31, 0.95);
            color: #fff;
            border: 1px solid var(--t-border-bright);
            border-radius: 12px;
            padding: 15px;
            width: 240px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s, transform 0.2s;
            transform: translateY(10px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            backdrop-filter: blur(8px);
        `;
        document.body.appendChild(this.tooltip);
    }

    private createConfirmPopup(): void {
        this.confirmPopup = document.createElement('div');
        this.confirmPopup.id = 't-clan-confirm-popup';
        this.confirmPopup.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 10000;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(4px);
            display: none;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s;
        `;

        const card = document.createElement('div');
        card.className = 't-glass-panel';
        card.style.cssText = `
            width: 360px;
            padding: 30px;
            border: 1px solid var(--t-border-bright);
            border-radius: 20px;
            text-align: center;
            transform: scale(0.9);
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            box-shadow: 0 20px 50px rgba(0,0,0,0.6);
        `;

        card.innerHTML = `
            <div style="font-size: 40px; margin-bottom: 20px;">⚠️</div>
            <h2 id="t-popup-title" style="font-size: 20px; font-weight: 900; color: #fff; margin-bottom: 12px;">ATTENTION</h2>
            <p id="t-popup-message" style="font-size: 13px; color: var(--t-text-muted); line-height: 1.6; margin-bottom: 30px;">
                Voulez-vous vraiment exclure cette unité définitivement ?
            </p>
            <div style="display: flex; gap: 12px;">
                <button id="t-popup-cancel" class="t-action-btn-header" style="flex: 1; padding: 12px; border-radius: 12px; font-weight: 800; cursor: pointer; background: rgba(255,255,255,0.05); border: 1px solid var(--t-border); color: #fff;">
                    ANNULER
                </button>
                <button id="t-popup-confirm" style="flex: 1; padding: 12px; border-radius: 12px; font-weight: 900; cursor: pointer; background: var(--t-red); border: 1px solid #fff; color: #fff; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);">
                    CONFIRMER
                </button>
            </div>
        `;

        this.confirmPopup.appendChild(card);
        document.body.appendChild(this.confirmPopup);

        // Cancel events
        card.querySelector('#t-popup-cancel')?.addEventListener('click', () => this.hideConfirmPopup());
        this.confirmPopup.addEventListener('click', (e) => {
            if (e.target === this.confirmPopup) this.hideConfirmPopup();
        });
    }

    private showConfirmPopup(title: string, message: string, onConfirm: () => void, isError: boolean = false): void {
        if (!this.confirmPopup) return;
        const titleEl = this.confirmPopup.querySelector('#t-popup-title') as HTMLElement;
        const msgEl = this.confirmPopup.querySelector('#t-popup-message') as HTMLElement;
        const confirmBtn = this.confirmPopup.querySelector('#t-popup-confirm') as HTMLElement;
        const cancelBtn = this.confirmPopup.querySelector('#t-popup-cancel') as HTMLElement;
        const card = this.confirmPopup.firstChild as HTMLElement;

        titleEl.textContent = title;
        msgEl.textContent = message;

        if (isError) {
            confirmBtn.style.display = 'none';
            cancelBtn.textContent = 'RETOUR';
            cancelBtn.style.flex = '1';
        } else {
            confirmBtn.style.display = 'block';
            cancelBtn.textContent = 'ANNULER';
            cancelBtn.style.flex = '1';

            const newConfirm = confirmBtn.cloneNode(true);
            confirmBtn.parentNode?.replaceChild(newConfirm, confirmBtn);
            newConfirm.addEventListener('click', () => {
                onConfirm();
                this.hideConfirmPopup();
            });
        }

        this.confirmPopup.style.display = 'flex';
        this.confirmPopup.offsetHeight;
        this.confirmPopup.style.opacity = '1';
        card.style.transform = 'scale(1)';
    }

    private hideConfirmPopup(): void {
        if (!this.confirmPopup) return;
        const card = this.confirmPopup.firstChild as HTMLElement;
        this.confirmPopup.style.opacity = '0';
        card.style.transform = 'scale(0.9)';
        setTimeout(() => {
            if (this.confirmPopup) this.confirmPopup.style.display = 'none';
        }, 300);
    }

    private renderAccessoryManager(unit: UnitData): void {
        this.accessoryModal.open(unit);
    }

    public render(): void {
        const units = ClanManager.getInstance().getAllUnits();
        if (!this.selectedUnitId && units.length > 0) {
            this.selectedUnitId = units[0].id;
        }

        const selectedUnit = units.find(u => u.id === this.selectedUnitId) || units[0];

        this.container.innerHTML = `
            <div class="t-roster-sidebar" style="flex-shrink: 0;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 30px;">
                    <span style="color: var(--t-blue); font-size: 20px;">👥</span>
                    <h2 style="font-size: 18px; font-weight: 800;">Membres du Clan</h2>
                    <span style="margin-left: auto; color: var(--t-text-muted); font-size: 11px; font-weight: 700;">(${units.length}/12)</span>
                </div>
                
                <div class="t-unit-grid">
                    ${this.renderRosterSlots(units)}
                </div>
            </div>

            <div class="t-details-view t-scrollbar" style="position: relative; flex: 1; padding: 30px;">
                ${selectedUnit ? this.renderDetails(selectedUnit) : ''}
            </div>
        `;

        this.attachEvents();
    }

    private renderRosterSlots(units: UnitData[]): string {
        let html = '';
        for (let i = 0; i < 12; i++) {
            const unit = units[i];
            const isSelected = unit?.id === this.selectedUnitId;
            const charColor = unit ? unit.portraitColor || '#3b82f6' : 'transparent';
            
            html += `
                <div class="t-unit-slot ${isSelected ? 'active' : ''}" 
                     data-unit-id="${unit?.id || ''}"
                     style="${!unit ? 'opacity: 0.15; cursor: default;' : ''}">
                    ${unit ? `
                        <div style="width: 48px; height: 48px; border-radius: 100%; background: ${charColor}; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 20px; color: white; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
                            ${unit.unitName.charAt(0)}
                        </div>
                        <div class="t-lvl-badge">L${unit.level.currentLevel}</div>
                    ` : '<span style="font-size: 20px; opacity: 0.2;">👤</span>'}
                </div>
            `;
        }
        return html;
    }

    private renderDetails(unit: UnitData): string {
        const hpPercent = Math.min(100, Math.max(0, (unit.baseStats.maxHealth / unit.baseStats.maxHealth) * 100));
        const dm = DataManager.getInstance();

        // Calculate bonuses from accessories
        const strBonus = dm.getGearBonus(unit, StatType.Strength);
        const magBonus = dm.getGearBonus(unit, StatType.Magic);
        const endBonus = dm.getGearBonus(unit, StatType.Endurance);
        const dexBonus = dm.getGearBonus(unit, StatType.Dexterity);
        const chaBonus = dm.getGearBonus(unit, StatType.Charisma);

        const weapon1Data = (unit.weaponIds && unit.weaponIds[0]) ? dm.getWeaponData(unit.weaponIds[0]) : null;
        const weapon2Data = (unit.weaponIds && unit.weaponIds[1]) ? dm.getWeaponData(unit.weaponIds[1]) : null;
        
        const acc1Id = (unit.accessorySlots && unit.accessorySlots[0]);
        const acc1Data = acc1Id ? dm.getItemData(acc1Id) : null;
        
        const acc2Id = (unit.accessorySlots && unit.accessorySlots[1]);
        const acc2Data = acc2Id ? dm.getItemData(acc2Id) : null;

        return `
            <div class="t-unit-card-hero" style="padding: 18px 24px; margin-bottom: 0; gap: 24px; align-items: center;">
                <div style="width: 84px; height: 84px; border-radius: 18px; background: ${unit.portraitColor || '#3b82f6'}; display: flex; align-items: center; justify-content: center; font-size: 40px; font-weight: 900; color: white; box-shadow: 0 8px 20px rgba(0,0,0,0.4); flex-shrink: 0;">
                    ${unit.unitName.charAt(0)}
                </div>
                
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                            <h1 style="font-size: 28px; font-weight: 900; letter-spacing: -1px; margin-bottom: 4px;">${unit.unitName}</h1>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-size: 13px; font-weight: 700; color: var(--t-text-muted); text-transform: uppercase;">${unit.characterClass}</span>
                                <span style="color: var(--t-border-bright);">|</span>
                                <div style="color: var(--t-blue); font-size: 12px; font-weight: 900;">
                                    LVL <span style="font-size: 14px;">${unit.level.currentLevel}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 10px; align-self: center;">
                            <button id="t-manage-accessories-btn" class="t-action-btn-header" style="background: var(--t-panel-dark); border: 1px solid var(--t-border-bright); color: var(--t-text-main); padding: 8px 14px; border-radius: 10px; font-size: 10px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s;">
                                💍 GÉRER ACCESSOIRES
                            </button>
                            <button id="t-exclude-unit-btn" style="background: var(--t-red); border: 1px solid white; color: white; padding: 8px 14px; border-radius: 10px; font-size: 10px; font-weight: 900; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s; box-shadow: 0 4px 10px rgba(239, 68, 68, 0.2);">
                                🗑️ EXCLURE
                            </button>
                        </div>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 6px; font-size: 9px; font-weight: 900; color: var(--t-red); text-transform: uppercase;">
                                <span style="font-size: 12px;">❤</span> HP
                            </div>
                            <div style="font-size: 11px; font-weight: 800; color: var(--t-text-muted);">${unit.baseStats.maxHealth} / ${unit.baseStats.maxHealth}</div>
                        </div>
                        <div class="t-hp-bar-container" style="height: 8px;">
                            <div class="t-hp-bar-fill" style="width: ${hpPercent}%;"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px;">
                <div>
                     <h3 style="font-size: 11px; font-weight: 900; color: var(--t-text-dim); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 20px;">Équipement</h3>
                     <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${this.renderEquipSlot('ARME 1', weapon1Data ? weapon1Data.weaponName : 'Emplacement Vide', 'var(--t-red)', '⚔️', !weapon1Data, true, weapon1Data)}
                        ${this.renderEquipSlot('ARME 2', weapon2Data ? weapon2Data.weaponName : 'Emplacement Vide', 'var(--t-red)', '⚔️', !weapon2Data, true, weapon2Data)}
                        ${this.renderEquipSlot('ACC. 1', acc1Data ? acc1Data.itemName : 'Emplacement Vide', 'var(--t-gold)', acc1Data?.iconKey || '💍', !acc1Data, false, acc1Data)}
                        ${this.renderEquipSlot('ACC. 2', acc2Data ? acc2Data.itemName : 'Emplacement Vide', 'var(--t-gold)', acc2Data?.iconKey || '💍', !acc2Data, false, acc2Data)}
                     </div>
                </div>

                <div>
                    <h3 style="font-size: 11px; font-weight: 900; color: var(--t-text-dim); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 20px;">Compétences</h3>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${(unit.skillIds || []).slice(0, 4).map(skillId => {
                            const skill = dm.getSkillData(skillId);
                            return this.renderSkillSlot(skill?.nameAct || skillId, skill?.point || 0, skill?.iconKey || '✨', skill);
                        }).join('')}
                        ${!(unit.skillIds && unit.skillIds.length) ? '<div style="opacity:0.3; font-size:11px; text-align:center; padding: 20px; border: 1px dashed var(--t-border);">Aucune compétence</div>' : ''}
                    </div>
                </div>

                <div>
                    <h3 style="font-size: 11px; font-weight: 900; color: var(--t-text-dim); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 20px;">Statistiques</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        ${this.renderStatCard('FORCE', 'FOR', unit.baseStats.strength, strBonus, 'var(--t-red)', 'Détermine la puissance des attaques physiques.')}
                        ${this.renderStatCard('MAGIE', 'MAG', unit.baseStats.magic, magBonus, 'var(--t-purple)', 'Détermine la puissance des sorts magiques.')}
                        ${this.renderStatCard('ENDURENCE', 'END', unit.baseStats.endurance, endBonus, 'var(--t-blue)', 'Réduit les dégâts physiques et magiques subis.')}
                        ${this.renderStatCard('VITESSE', 'DEX', unit.baseStats.dexterity, dexBonus, 'var(--t-purple)', 'Améliore la précision et l\'initiative.')}
                        ${this.renderStatCard('CHARISME', 'CHA', unit.baseStats.charisma, chaBonus, 'var(--t-gold)', 'Augmente l\'efficacité des soutiens.')}
                        ${this.renderStatCard('DÉPLAC.', 'MOV', unit.baseStats.moveRange, 0, 'var(--t-text-muted)', 'Nombre maximum de cases de déplacement.')}
                    </div>
                </div>
            </div>
        `;
    }

    private renderEquipSlot(label: string, name: string, accentColor: string, icon: string, empty: boolean = false, locked: boolean = false, data: any = null): string {
        const borderStyle = empty ? 'dashed' : 'solid';
        let tooltipContent = '';
        if (data) {
            if (data.weaponName) {
                // Weapon Tooltip
                tooltipContent = `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="font-size: 18px;">${icon}</span>
                        <span style="font-weight: 900; font-size: 16px; color: ${accentColor};">${data.weaponName}</span>
                    </div>
                    <div style="font-size: 11px; color: #fff; margin-bottom: 15px; opacity: 0.8; line-height: 1.4;">Type: ${data.type}</div>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <div style="flex:1; background: rgba(255,255,255,0.05); padding: 5px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 9px; color: var(--t-text-dim);">DÉGÂTS</div>
                            <div style="font-size: 16px; font-weight: 900; color: var(--t-red);">${data.damage}</div>
                        </div>
                        <div style="flex:1; background: rgba(255,255,255,0.05); padding: 5px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 9px; color: var(--t-text-dim);">PORTÉE</div>
                            <div style="font-size: 16px; font-weight: 900; color: var(--t-blue);">${data.range}</div>
                        </div>
                    </div>
                `;
            } else {
                // Accessory/Item Tooltip
                tooltipContent = `
                    <div style="font-weight: 800; color: ${accentColor}; margin-bottom:4px; font-size: 16px;">${data.itemName}</div>
                    <div style="font-size: 12px; margin-bottom:8px; opacity: 0.9; color: #fff;">${data.description}</div>
                    ${data.statModifiers ? data.statModifiers.map((s: any) => `<div style='font-size:11px; color: var(--t-blue); font-weight: 700;'>+${s.value} ${s.stat}</div>`).join('') : ''}
                `;
            }
        } else if (label.includes('ACC') && !empty) {
             tooltipContent = `<div style="font-weight: 800; color: var(--t-gold);">${name}</div><div style="font-size: 12px; margin-top: 5px; opacity: 0.8;">Un accessoire améliorant les capacités du porteur.</div>`;
        }

        return `
            <div class="t-equip-slot" 
                 data-tooltip-content="${tooltipContent ? encodeURIComponent(tooltipContent) : ''}"
                 style="padding: 12px 15px; gap: 12px; ${locked ? 'opacity: 0.8; cursor: default;' : ''} border: 1px ${borderStyle} var(--t-border);">
                <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(0,0,0,0.2); border: 1px solid ${empty ? 'var(--t-border)' : accentColor + '30'}; display: flex; align-items: center; justify-content: center; font-size: 18px; color: ${empty ? 'var(--t-text-dim)' : accentColor}; flex-shrink: 0;">
                    ${empty ? '○' : icon }
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 8px; font-weight: 800; color: var(--t-text-dim); text-transform: uppercase; margin-bottom: 2px;">
                        ${label} ${locked && !empty ? '<span style="font-size: 7px;">(FIXE)</span>' : ''}
                    </div>
                    <div style="font-size: 14px; font-weight: 700; color: ${empty ? 'var(--t-text-dim)' : 'var(--t-text-main)'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</div>
                </div>
                ${(!locked && !empty) ? '<div style="color: var(--t-text-dim); font-size: 14px;">›</div>' : ''}
            </div>
        `;
    }

    private renderSkillSlot(name: string, apCost: number, icon: string, data: any = null): string {
        let tooltipContent = '';
        if (data) {
            tooltipContent = `
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                    <span style="font-size: 20px;">${icon}</span>
                    <span style="font-weight: 900; font-size: 16px; color: var(--t-blue);">${data.nameAct}</span>
                </div>
                <div style="font-size: 12px; color: #fff; opacity: 0.9; line-height: 1.5; margin-bottom: 15px;">${data.description}</div>
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(59, 130, 246, 0.1); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--t-blue-glow);">
                    <span style="font-size: 10px; font-weight: 800; color: var(--t-blue);">ACTION TYPE</span>
                    <span style="font-size: 11px; font-weight: 900; color: #fff;">${data.typeAction}</span>
                </div>
            `;
        }

        return `
            <div class="t-skill-card" 
                 data-tooltip-content="${tooltipContent ? encodeURIComponent(tooltipContent) : ''}"
                 style="padding: 14px; display: flex; align-items: center; gap: 12px; cursor: help;">
                <div style="font-size: 20px;">${icon}</div>
                <div style="flex: 1;">
                    <div style="font-size: 15px; font-weight: 800; color: var(--t-text-main); margin-bottom: 2px;">${name}</div>
                    <div style="font-size: 9px; font-weight: 800; color: var(--t-blue); text-transform: uppercase;">Coût : ${apCost} AP</div>
                </div>
            </div>
        `;
    }

    private renderStatCard(label: string, short: string, base: number, bonus: number, accent: string, help: string): string {
        const tooltipContent = `
            <div style="font-weight: 900; font-size: 14px; color: ${accent}; margin-bottom: 5px;">${label} (${short})</div>
            <div style="font-size: 12px; color: #fff; opacity: 0.95; line-height: 1.4;">${help}</div>
            ${bonus > 0 ? `<div style="margin-top:5px; font-size:11px; color:#4ade80;">Bonus équipement: +${bonus}</div>` : ''}
        `;

        return `
            <div data-tooltip-content="${encodeURIComponent(tooltipContent)}"
                 style="background: var(--t-card); border: 1px solid var(--t-border); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; cursor: help;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 9px; font-weight: 900; color: var(--t-text-muted); text-transform: uppercase;">${label}</span>
                    <span style="font-size: 9px; font-weight: 900; color: ${accent}; opacity: 0.9;">${short}</span>
                </div>
                <div style="font-size: 24px; font-weight: 900; color: var(--t-text-main); text-align: center; margin-top: 2px; display: flex; align-items: center; justify-content: center; gap: 4px;">
                    ${base}
                    ${bonus > 0 ? `<span style="font-size: 14px; color: #4ade80; vertical-align: top;">+${bonus}</span>` : ''}
                </div>
            </div>
        `;
    }

    private attachEvents(): void {
        this.container.querySelectorAll('.t-unit-slot[data-unit-id]').forEach(slot => {
            const id = (slot as HTMLElement).dataset.unitId;
            if (!id) return;
            slot.addEventListener('click', () => {
                this.selectedUnitId = id;
                this.render();
            });
        });

        this.container.querySelectorAll('[data-tooltip-content]').forEach(el => {
            const content = (el as HTMLElement).dataset.tooltipContent;
            if (!content) return;

            el.addEventListener('mouseenter', ((e: MouseEvent) => {
                this.showTooltip(e, decodeURIComponent(content));
            }) as EventListener);
            
            el.addEventListener('mouseleave', (() => {
                this.hideTooltip();
            }) as EventListener);
            
            el.addEventListener('mousemove', ((e: MouseEvent) => {
                this.moveTooltip(e);
            }) as EventListener);
        });

        const excludeBtn = document.getElementById('t-exclude-unit-btn');
        if (excludeBtn && this.selectedUnitId) {
            excludeBtn.addEventListener('click', () => {
                const units = ClanManager.getInstance().getAllUnits();
                const unit = units.find(u => u.id === this.selectedUnitId);

                if (units.length <= 1) {
                    this.showConfirmPopup(
                        "ACTION IMPOSSIBLE",
                        "Vous ne pouvez pas exclure le dernier membre de votre clan.",
                        () => {},
                        true
                    );
                    return;
                }

                this.showConfirmPopup(
                    "CONFIRMATION",
                    `Voulez-vous vraiment exclure ${unit?.unitName || 'cette unité'} définitivement ? Toutes ses pièces d'équipement seront perdues.`,
                    () => {
                        ClanManager.getInstance().removeUnit(this.selectedUnitId!);
                        this.selectedUnitId = null;
                        this.render();
                    }
                );
            });
        }

        const manageAccBtn = document.getElementById('t-manage-accessories-btn');
        if (manageAccBtn && this.selectedUnitId) {
            manageAccBtn.addEventListener('click', () => {
                const units = ClanManager.getInstance().getAllUnits();
                const unit = units.find(u => u.id === this.selectedUnitId);
                if (unit) {
                    this.renderAccessoryManager(unit);
                }
            });
        }
    }

    private showTooltip(e: MouseEvent, content: string): void {
        if (!this.tooltip) return;
        this.tooltip.innerHTML = content;
        this.tooltip.style.opacity = '1';
        this.tooltip.style.transform = 'translateY(0)';
        this.moveTooltip(e);
    }

    private moveTooltip(e: MouseEvent): void {
        if (!this.tooltip) return;
        let x = e.clientX + 15;
        let y = e.clientY + 15;
        if (x + 240 > window.innerWidth) x = e.clientX - 250;
        if (y + 150 > window.innerHeight) y = e.clientY - 160;
        this.tooltip.style.left = `${x}px`;
        this.tooltip.style.top = `${y}px`;
    }

    private hideTooltip(): void {
        if (!this.tooltip) return;
        this.tooltip.style.opacity = '0';
        this.tooltip.style.transform = 'translateY(10px)';
    }

    public dispose(): void {
        if (this.tooltip) this.tooltip.remove();
        if (this.confirmPopup) this.confirmPopup.remove();
    }
}
