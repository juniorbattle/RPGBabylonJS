import { ClanManager } from '../data/ClanManager';
import { DataManager } from '../data/DataManager';
import { UnitData } from '../data/types/UnitData';
import { ItemCategory } from '../data/types/ItemData';

export class AccessoryModalUI {
    private modalElement: HTMLElement;
    private unit: UnitData | null = null;
    private tooltip: HTMLElement | null = null;
    private onUpdate: () => void;
    
    // Pagination State
    private currentPage: number = 0;
    private itemsPerPage: number = 4;

    constructor(onUpdate: () => void) {
        this.onUpdate = onUpdate;
        this.modalElement = document.createElement('div');
        this.modalElement.id = 't-accessory-modal';
        this.modalElement.style.cssText = `
            position: fixed; inset: 0; z-index: 20000;
            background: rgba(0, 0, 0, 0.85); color: #FFFFFF; backdrop-filter: blur(8px);
            display: none; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.3s;
        `;
        document.body.appendChild(this.modalElement);
        this.createTooltip();
        this.attachEvents();
    }

    private createTooltip(): void {
        this.tooltip = document.createElement('div');
        this.tooltip.style.cssText = `
            position: fixed; z-index: 21000; pointer-events: none;
            background: rgba(15, 20, 31, 0.95); border: 1px solid var(--t-border-bright);
            border-radius: 8px; padding: 12px; width: 220px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); backdrop-filter: blur(4px);
            opacity: 0; transition: opacity 0.15s; font-size: 12px; color: #fff; line-height: 1.4;
        `;
        document.body.appendChild(this.tooltip);
    }

    private attachEvents(): void {
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) this.close();
        });

        this.modalElement.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const clan = ClanManager.getInstance();

            if (target.classList.contains('t-unequip-btn')) {
                const slot = parseInt(target.dataset.slot!);
                clan.unequipAccessory(this.unit!.id, slot);
                this.hideTooltip();
                this.refresh();
            } else if (target.classList.contains('t-equip-to-slot')) {
                const itemId = target.dataset.itemId!;
                const slot = parseInt(target.dataset.slot!);
                clan.equipAccessory(this.unit!.id, itemId, slot);
                this.hideTooltip();
                this.refresh();
            } else if (target.id === 't-close-accessory-modal') {
                this.close();
            } else if (target.classList.contains('t-prev-page')) {
                if (this.currentPage > 0) {
                    this.currentPage--;
                    this.refresh();
                }
            } else if (target.classList.contains('t-next-page')) {
                const clan = ClanManager.getInstance();
                const accessories = clan.getInventoryByType(ItemCategory.Accessory);
                const maxPage = Math.ceil(accessories.length / this.itemsPerPage) - 1;
                if (this.currentPage < maxPage) {
                    this.currentPage++;
                    this.refresh();
                }
            }
        });

        // Tooltip Delegation
        this.modalElement.addEventListener('mouseover', (e) => {
            const target = (e.target as HTMLElement).closest('[data-tooltip-content]');
            if (target) {
                const content = (target as HTMLElement).dataset.tooltipContent;
                if (content) this.showTooltip(decodeURIComponent(content));
            }
        });

        this.modalElement.addEventListener('mousemove', (e) => {
            if (this.tooltip && this.tooltip.style.opacity === '1') {
                this.moveTooltip(e);
            }
        });

        this.modalElement.addEventListener('mouseout', (e) => {
            const target = (e.target as HTMLElement).closest('[data-tooltip-content]');
            if (target) {
                this.hideTooltip();
            }
        });
    }

    private showTooltip(content: string): void {
        if (!this.tooltip) return;
        this.tooltip.innerHTML = content;
        this.tooltip.style.opacity = '1';
    }

    private moveTooltip(e: MouseEvent): void {
        if (!this.tooltip) return;
        const x = e.clientX + 15;
        const y = e.clientY + 15;
        this.tooltip.style.left = `${x}px`;
        this.tooltip.style.top = `${y}px`;
    }

    private hideTooltip(): void {
        if (!this.tooltip) return;
        this.tooltip.style.opacity = '0';
    }

    public open(unit: UnitData): void {
        this.unit = unit;
        this.currentPage = 0; // Reset page on open
        this.modalElement.style.display = 'flex';
        // Force reflow
        this.modalElement.offsetHeight;
        this.modalElement.style.opacity = '1';
        this.refresh();
    }

    public close(): void {
        this.hideTooltip();
        this.modalElement.style.opacity = '0';
        setTimeout(() => {
            this.modalElement.style.display = 'none';
            this.onUpdate();
        }, 300);
    }

    private refresh(): void {
        const clan = ClanManager.getInstance();
        const dm = DataManager.getInstance();
        const allAccessories = clan.getInventoryByType(ItemCategory.Accessory);
        const unit = this.unit!;

        // Pagination Logic
        const totalItems = allAccessories.length;
        const totalPages = Math.ceil(totalItems / this.itemsPerPage) || 1;
        
        // Clamp current page
        if (this.currentPage >= totalPages) this.currentPage = totalPages - 1;
        if (this.currentPage < 0) this.currentPage = 0;

        const startIndex = this.currentPage * this.itemsPerPage;
        const visibleItems = allAccessories.slice(startIndex, startIndex + this.itemsPerPage);

        this.modalElement.innerHTML = `
            <div class="t-glass-panel" style="width: 900px; height: 600px; padding: 40px; border: 1px solid var(--t-border-bright); border-radius: 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); display: flex; flex-direction: column;">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; flex-shrink: 0;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="font-size: 24px;">💍</div>
                        <div>
                            <h2 style="font-size: 24px; font-weight: 900; margin: 0;">Gestion des Accessoires</h2>
                            <div style="color: var(--t-blue); font-size: 14px; font-weight: 700;">${unit.unitName}</div>
                        </div>
                    </div>
                    <button id="t-close-accessory-modal" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; color: white; transition: 0.2s;">&times;</button>
                </div>

                <div style="display: grid; grid-template-columns: 300px 1fr; gap: 40px; flex: 1; min-height: 0;">
                    
                    <!-- Left: Equipped Slots -->
                    <div style="display: flex; flex-direction: column; gap: 20px; background: rgba(0,0,0,0.2); padding: 25px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);">
                        <h3 style="font-size: 11px; font-weight: 900; color: var(--t-text-muted); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px;">Équipement Actuel</h3>
                        
                        <div style="display: flex; flex-direction: column; gap: 15px;">
                            ${[0, 1].map(idx => {
                                const itemId = unit.accessorySlots[idx];
                                const item = itemId ? dm.getItemData(itemId) : null;
                                let tooltipAttr = '';
                                if (item) {
                                    const tooltipText = `
                                        <div style='font-weight:800; color: var(--t-blue); margin-bottom:4px;'>${item.itemName}</div>
                                        <div style='margin-bottom:8px;'>${item.description}</div>
                                        ${item.statModifiers.map((s: any) => `<div style='font-size:10px; color: var(--t-gold);'>+${s.value} ${s.stat}</div>`).join('')}
                                    `;
                                    tooltipAttr = `data-tooltip-content="${encodeURIComponent(tooltipText)}"`;
                                }

                                return `
                                    <div class="t-equip-slot" ${tooltipAttr} style="padding: 20px; border: 1px ${item ? 'solid var(--t-blue)' : 'dashed var(--t-border)'}; background: ${item ? 'rgba(59, 130, 246, 0.05)' : 'transparent'}; border-radius: 12px; display: flex; align-items: center; gap: 15px; position: relative; transition: 0.2s;">
                                        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 24px; color: var(--t-gold); border: 1px solid rgba(255,255,255,0.1);">
                                            ${item ? (item.iconKey || '💍') : '<span style="opacity:0.2">○</span>'}
                                        </div>
                                        <div style="flex: 1;">
                                            <div style="font-size: 9px; font-weight: 800; color: var(--t-text-dim); text-transform: uppercase; margin-bottom: 4px;">SLOT ${idx + 1}</div>
                                            <div style="font-size: 15px; font-weight: 800; color: ${item ? '#fff' : 'rgba(255,255,255,0.3)'};">${item?.itemName || 'Vide'}</div>
                                        </div>
                                        ${item ? `
                                            <button class="t-unequip-btn" data-slot="${idx}" style="width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--t-red); background: rgba(239,68,68,0.1); color: var(--t-red); display: flex; align-items: center; justify-content: center; font-size: 14px; cursor: pointer; transition: 0.2s;" title="Déséquiper">✕</button>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        
                        <div style="margin-top: auto; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                            <div style="font-size: 11px; color: var(--t-text-dim); line-height: 1.5; text-align: center;">
                                Sélectionnez un accessoire dans la liste pour l'équiper sur un emplacement libre ou remplacer l'existant.
                            </div>
                        </div>
                    </div>

                    <!-- Right: Inventory List -->
                    <div style="display: flex; flex-direction: column; min-height: 0;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                            <h3 style="font-size: 11px; font-weight: 900; color: var(--t-text-muted); text-transform: uppercase; letter-spacing: 2px;">Inventaire (${visibleItems.length}/${totalItems})</h3>
                        </div>

                        <!-- Grid -->
                        <div class="t-scrollbar" style="display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(2, 1fr); gap: 15px; overflow-y: auto; padding-right: 5px;">
                            ${visibleItems.length > 0 ? visibleItems.map(inv => {
                                const item = inv.itemData;
                                // Tooltip preparation: Name + Description + Stats
                                const tooltipText = `
                                    <div style='font-weight:800; color: var(--t-blue); margin-bottom:4px;'>${item.itemName}</div>
                                    <div style='margin-bottom:8px;'>${item.description}</div>
                                    ${item.statModifiers.map(s => `<div style='font-size:10px; color: var(--t-gold);'>+${s.value} ${s.stat}</div>`).join('')}
                                `;

                                return `
                                    <div class="t-glass-panel" data-tooltip-content="${encodeURIComponent(tooltipText)}" style="padding: 15px; display: flex; flex-direction: column; gap: 12px; border: 1px solid var(--t-border); transition: 0.2s; background: rgba(255,255,255,0.02);">
                                        <div style="display: flex; gap: 12px;">
                                            <div style="width: 42px; height: 42px; border-radius: 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); font-size: 20px; display: flex; align-items: center; justify-content: center;">
                                                ${item.iconKey || '💍'}
                                            </div>
                                            <div style="flex: 1; min-width: 0;">
                                                <div style="font-size: 14px; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.itemName}</div>
                                                <div style="font-size: 10px; color: var(--t-gold); font-weight: 700; margin-top: 2px;">x${inv.quantity} disponible</div>
                                            </div>
                                        </div>
                                        
                                        <div style="display: flex; gap: 8px; margin-top: auto;">
                                            <button class="t-equip-to-slot" data-item-id="${item.id}" data-slot="0" style="flex: 1; padding: 8px 0; border-radius: 6px; font-size: 10px; font-weight: 800; cursor: pointer; background: rgba(255,255,255,0.05); color: #fff; border: 1px solid rgba(255,255,255,0.1); transition: 0.2s;">
                                                METTRE SLOT 1
                                            </button>
                                            <button class="t-equip-to-slot" data-item-id="${item.id}" data-slot="1" style="flex: 1; padding: 8px 0; border-radius: 6px; font-size: 10px; font-weight: 800; cursor: pointer; background: rgba(255,255,255,0.05); color: #fff; border: 1px solid rgba(255,255,255,0.1); transition: 0.2s;">
                                                METTRE SLOT 2
                                            </button>
                                        </div>
                                    </div>
                                `;
                            }).join('') : `
                                <div style="grid-column: 1/-1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; opacity: 0.3; gap: 10px;">
                                    <div style="font-size: 30px;">🎒</div>
                                    <div style="font-weight: 700; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Aucun accessoire</div>
                                </div>
                            `}
                        </div>

                        <!-- Pagination Controls -->
                        <div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin-top: auto; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                            <button class="t-prev-page" ${this.currentPage === 0 ? 'disabled' : ''} style="padding: 10px 20px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: ${this.currentPage === 0 ? 'transparent' : 'rgba(255,255,255,0.05)'}; color: ${this.currentPage === 0 ? 'rgba(255,255,255,0.2)' : '#fff'}; cursor: ${this.currentPage === 0 ? 'default' : 'pointer'}; font-weight: 800; font-size: 11px; transition: 0.2s;">
                                ← PRÉCÉDENT
                            </button>
                            
                            <div style="display: flex; gap: 6px;">
                                <div style="font-size: 11px; font-weight: 700; color: var(--t-text-dim);">PAGE ${this.currentPage + 1} / ${totalPages}</div>
                            </div>

                            <button class="t-next-page" ${this.currentPage >= totalPages - 1 ? 'disabled' : ''} style="padding: 10px 20px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: ${this.currentPage >= totalPages - 1 ? 'transparent' : 'rgba(255,255,255,0.05)'}; color: ${this.currentPage >= totalPages - 1 ? 'rgba(255,255,255,0.2)' : '#fff'}; cursor: ${this.currentPage >= totalPages - 1 ? 'default' : 'pointer'}; font-weight: 800; font-size: 11px; transition: 0.2s;">
                                SUIVANT →
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
