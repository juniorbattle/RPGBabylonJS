import { ClanManager } from '../data/ClanManager';
import { ItemCategory, InventoryItem } from '../data/types/ItemData';

export class InventoryUI {
    private container: HTMLElement;
    private currentFilter: ItemCategory | 'ALL' = 'ALL';
    private currentPage: number = 0;
    private itemsPerPage: number = 6;
    private tooltip: HTMLElement | null = null;

    constructor(parent: HTMLElement) {
        this.container = document.createElement('div');
        this.container.className = 't-glass-panel t-animate-fade-up';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        parent.appendChild(this.container);
        this.createTooltip();
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

    public render(): void {
        const cm = ClanManager.getInstance();
        let items: InventoryItem[] = [];

        if (this.currentFilter === 'ALL') {
            items = [
                ...cm.getInventoryByType(ItemCategory.Consumable),
                ...cm.getInventoryByType(ItemCategory.Accessory),
                ...cm.getInventoryByType(ItemCategory.Material)
            ];
        } else {
            items = cm.getInventoryByType(this.currentFilter);
        }

        const totalPages = Math.ceil(items.length / this.itemsPerPage) || 1;
        if (this.currentPage >= totalPages) this.currentPage = totalPages - 1;
        if (this.currentPage < 0) this.currentPage = 0;

        const start = this.currentPage * this.itemsPerPage;
        const visibleItems = items.slice(start, start + this.itemsPerPage);

        this.container.innerHTML = `
            <!-- Filters Header -->
            <div style="padding: 30px; border-bottom: 1px solid var(--t-border); display: flex; align-items: center; gap: 20px;">
                <h2 style="font-size: 20px; font-weight: 800; margin-right: 20px;"><span style="color:var(--t-blue);">🎒</span> Inventaire</h2>
                
                <div style="display: flex; gap: 10px;">
                    ${this.renderFilterPill('ALL', 'Tout')}
                    ${this.renderFilterPill(ItemCategory.Consumable, 'Consommables')}
                    ${this.renderFilterPill(ItemCategory.Accessory, 'Accessoires')}
                    ${this.renderFilterPill(ItemCategory.Material, 'Matériaux')}
                </div>
            </div>

            <!-- Items Grid -->
            <div class="t-scrollbar" style="flex: 1; padding: 30px; overflow-y: auto;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                    ${visibleItems.length > 0 ? visibleItems.map(invItem => this.renderItemCard(invItem)).join('') : this.renderEmptyState()}
                </div>
            </div>

            <!-- Pagination Footer -->
            <div style="padding: 20px 30px; border-top: 1px solid var(--t-border); display: flex; justify-content: center; align-items: center; gap: 20px;">
                <button class="t-inv-prev" ${this.currentPage === 0 ? 'disabled' : ''} style="padding: 10px 20px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: ${this.currentPage === 0 ? 'transparent' : 'rgba(255,255,255,0.05)'}; color: ${this.currentPage === 0 ? 'rgba(255,255,255,0.2)' : '#fff'}; cursor: ${this.currentPage === 0 ? 'default' : 'pointer'}; font-weight: 800; font-size: 11px; transition: 0.2s;">
                    ← PRÉCÉDENT
                </button>
                
                <div style="font-size: 11px; font-weight: 700; color: var(--t-text-dim);">
                    PAGE ${this.currentPage + 1} / ${totalPages}
                </div>

                <button class="t-inv-next" ${this.currentPage >= totalPages - 1 ? 'disabled' : ''} style="padding: 10px 20px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: ${this.currentPage >= totalPages - 1 ? 'transparent' : 'rgba(255,255,255,0.05)'}; color: ${this.currentPage >= totalPages - 1 ? 'rgba(255,255,255,0.2)' : '#fff'}; cursor: ${this.currentPage >= totalPages - 1 ? 'default' : 'pointer'}; font-weight: 800; font-size: 11px; transition: 0.2s;">
                    SUIVANT →
                </button>
            </div>
        `;

        this.attachEvents();
    }

    private renderFilterPill(id: string, label: string): string {
        const isActive = this.currentFilter === id;
        return `
            <button class="t-filter-pill" data-filter="${id}"
                    style="background: ${isActive ? 'rgba(255,255,255,0.08)' : 'transparent'}; 
                           border: 1px solid ${isActive ? 'var(--t-border-bright)' : 'var(--t-border)'}; 
                           color: ${isActive ? 'var(--t-text-main)' : 'var(--t-text-muted)'}; 
                           padding: 8px 18px; 
                           border-radius: 100px; 
                           font-size: 11px; 
                           font-weight: 800; 
                           cursor: pointer; 
                           text-transform: uppercase;
                           transition: 0.2s;">
                ${label}
            </button>
        `;
    }

    private renderItemCard(invItem: InventoryItem): string {
        const { itemData, quantity } = invItem;
        const icon = itemData.iconKey || '📦';
        const color = itemData.category === ItemCategory.Consumable ? 'var(--t-red)' : (itemData.category === ItemCategory.Accessory ? 'var(--t-gold)' : 'var(--t-text-muted)');

        // Build Tooltip
        let extraInfo = '';
        if (itemData.statModifiers) {
            extraInfo = itemData.statModifiers.map((s: any) => `<div style='font-size:10px; color: var(--t-blue);'>+${s.value} ${s.stat}</div>`).join('');
        } else if (itemData.power) {
            const type = itemData.typeAction === 'HEAL' ? 'Soin' : 'Dégâts';
            extraInfo = `<div style='font-size:10px; color: var(--t-red);'>${type} : ${itemData.power}</div>`;
        }

        const tooltipContent = `
            <div style="font-weight: 800; color: ${color}; margin-bottom:4px; font-size: 16px;">${itemData.itemName}</div>
            <div style="font-size: 12px; margin-bottom:8px; opacity: 0.9; color: #fff;">${itemData.description}</div>
            ${extraInfo}
        `;

        return `
            <div data-tooltip-content="${encodeURIComponent(tooltipContent)}" style="background: rgba(255,255,255,0.02); border: 1px solid var(--t-border); border-radius: 20px; padding: 20px; display: flex; align-items: center; gap: 20px; transition: 0.2s; cursor: help;" onmouseover="this.style.borderColor='var(--t-border-bright)'" onmouseout="this.style.borderColor='var(--t-border)'">
                <div style="width: 60px; height: 60px; background: rgba(0,0,0,0.2); border: 1px solid var(--t-border); border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 32px;">
                    ${icon}
                </div>
                
                <div style="flex: 1;">
                    <div style="font-size: 9px; font-weight: 900; color: ${color}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">${itemData.category}</div>
                    <div style="font-size: 16px; font-weight: 800; color: var(--t-text-main);">${itemData.itemName}</div>
                    <div style="font-size: 11px; font-weight: 700; color: var(--t-text-muted); margin-top: 4px;">Quantité : <span style="color: var(--t-text-main);">${quantity}</span></div>
                </div>
            </div>
        `;
    }

    private renderEmptyState(): string {
        return `<div style="grid-column: span 2; padding: 100px; text-align: center; opacity: 0.2; font-weight: 800; font-size: 20px; text-transform: uppercase; letter-spacing: 4px;">Inventaire Vide</div>`;
    }

    private attachEvents(): void {
        this.container.querySelectorAll('.t-filter-pill').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentFilter = (e.currentTarget as HTMLElement).dataset.filter as any;
                this.currentPage = 0;
                this.render();
            });
        });

        this.container.querySelector('.t-inv-prev')?.addEventListener('click', () => {
            if (this.currentPage > 0) {
                this.currentPage--;
                this.render();
            }
        });

        this.container.querySelector('.t-inv-next')?.addEventListener('click', () => {
            this.currentPage++;
            this.render();
        });

        // Tooltip Events
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
    }
}
