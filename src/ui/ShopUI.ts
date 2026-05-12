import { ClanManager } from '../data/ClanManager';
import { DataManager } from '../data/DataManager';
import { ItemData, InventoryItem, ItemCategory } from '../data/types/ItemData';
import { MenuManager } from './MenuManager';

interface ShopItem {
    id: string;
    qty: number;
}

export class ShopUI {
    private container: HTMLElement;
    private mode: 'BUY' | 'SELL' = 'BUY';
    private currentFilter: ItemCategory | 'ALL' = 'ALL';
    private availableItems: ShopItem[];
    private tooltip: HTMLElement | null = null;
    private notificationContainer: HTMLElement | null = null;
    
    // Pagination
    private currentPage: number = 0;
    private itemsPerPage: number = 4;

    constructor(parent: HTMLElement, items: ShopItem[]) {
        this.availableItems = items;
        this.container = document.createElement('div');
        this.container.className = 't-glass-panel t-animate-fade-up';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        parent.appendChild(this.container);
        this.createTooltip();
        this.createNotificationContainer();
    }

    private createNotificationContainer(): void {
        this.notificationContainer = document.createElement('div');
        this.notificationContainer.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            z-index: 10000;
            pointer-events: none;
        `;
        document.body.appendChild(this.notificationContainer);
    }

    private showNotification(message: string, type: 'success' | 'error' = 'success'): void {
        if (!this.notificationContainer) return;

        const notif = document.createElement('div');
        notif.textContent = message;
        notif.style.cssText = `
            background: ${type === 'success' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 800;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.2);
            opacity: 0;
            transform: translateX(20px);
            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            backdrop-filter: blur(4px);
        `;

        this.notificationContainer.appendChild(notif);

        // Animate in
        requestAnimationFrame(() => {
            notif.style.opacity = '1';
            notif.style.transform = 'translateX(0)';
        });

        // Remove after delay
        setTimeout(() => {
            notif.style.opacity = '0';
            notif.style.transform = 'translateY(10px)';
            setTimeout(() => notif.remove(), 300);
        }, 3000);
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
        const fullList = this.getDisplayItems();
        
        // Pagination Logic
        const totalPages = Math.ceil(fullList.length / this.itemsPerPage) || 1;
        if (this.currentPage >= totalPages) this.currentPage = totalPages - 1;
        if (this.currentPage < 0) this.currentPage = 0;

        const start = this.currentPage * this.itemsPerPage;
        const displayItems = fullList.slice(start, start + this.itemsPerPage);

        this.container.innerHTML = `
            <!-- Shop Header -->
            <div style="padding: 30px; border-bottom: 1px solid var(--t-border); display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="font-size: 24px;">🛒</span>
                    <h2 style="font-size: 20px; font-weight: 800;">Marchand Itinérant</h2>
                </div>
                
                <!-- Toggle Mode -->
                <div style="background: var(--t-panel-dark); padding: 4px; border-radius: 12px; border: 1px solid var(--t-border-bright); display: flex; gap: 4px;">
                    <button id="shop-buy-mode" style="padding: 8px 18px; border-radius: 8px; border: none; font-size: 11px; font-weight: 800; cursor: pointer; transition: 0.2s; 
                        ${this.mode === 'BUY' ? 'background: var(--t-blue); color: white;' : 'background: transparent; color: var(--t-text-muted);'}">
                        ACHETER
                    </button>
                    <button id="shop-sell-mode" style="padding: 8px 18px; border-radius: 8px; border: none; font-size: 11px; font-weight: 800; cursor: pointer; transition: 0.2s;
                        ${this.mode === 'SELL' ? 'background: var(--t-blue); color: white;' : 'background: transparent; color: var(--t-text-muted);'}">
                        VENDRE
                    </button>
                </div>
            </div>

            <!-- Filters -->
            <div style="padding: 20px 30px; display: flex; gap: 10px; border-bottom: 1px solid var(--t-border);">
                ${this.renderFilterPill('ALL', 'Tout')}
                ${this.renderFilterPill(ItemCategory.Accessory, 'Accessoires')}
                ${this.renderFilterPill(ItemCategory.Consumable, 'Consommables')}
                ${this.renderFilterPill(ItemCategory.Material, 'Matériaux')}
            </div>

            <!-- Items List -->
            <div class="t-scrollbar" style="flex: 1; padding: 30px; overflow-y: auto;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                    ${displayItems.length > 0 ? displayItems.map(item => this.renderShopCard(item)).join('') : this.renderEmptyState()}
                </div>
            </div>

            <!-- Pagination Footer -->
            <div style="padding: 20px 30px; background: rgba(0,0,0,0.2); border-top: 1px solid var(--t-border); display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;">
                <div></div> <!-- Spacer -->
                
                <div style="display: flex; align-items: center; gap: 20px;">
                    <button class="t-shop-prev" ${this.currentPage === 0 ? 'disabled' : ''} style="padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: ${this.currentPage === 0 ? 'transparent' : 'rgba(255,255,255,0.05)'}; color: ${this.currentPage === 0 ? 'rgba(255,255,255,0.2)' : '#fff'}; cursor: ${this.currentPage === 0 ? 'default' : 'pointer'}; font-weight: 800; font-size: 10px; transition: 0.2s;">
                        ← PRÉC.
                    </button>
                    <div style="font-size: 10px; font-weight: 700; color: var(--t-text-dim);">
                        PAGE ${this.currentPage + 1} / ${totalPages}
                    </div>
                    <button class="t-shop-next" ${this.currentPage >= totalPages - 1 ? 'disabled' : ''} style="padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: ${this.currentPage >= totalPages - 1 ? 'transparent' : 'rgba(255,255,255,0.05)'}; color: ${this.currentPage >= totalPages - 1 ? 'rgba(255,255,255,0.2)' : '#fff'}; cursor: ${this.currentPage >= totalPages - 1 ? 'default' : 'pointer'}; font-weight: 800; font-size: 10px; transition: 0.2s;">
                        SUIV. →
                    </button>
                </div>
            </div>
        `;

        this.attachEvents();
    }

    private getDisplayItems(): InventoryItem[] {
        const cm = ClanManager.getInstance();
        const dm = DataManager.getInstance();
        
        if (this.mode === 'BUY') {
            return this.availableItems
                .map(shopItem => {
                    const data = dm.getItemData(shopItem.id);
                    if (!data) return null;
                    return { itemData: data, quantity: shopItem.qty };
                })
                .filter(item => item && 
                    (this.currentFilter === 'ALL' || item.itemData.category === this.currentFilter) &&
                    item.itemData.category !== ItemCategory.Material
                ) as InventoryItem[];
        } else {
            return [
                ...cm.getInventoryByType(ItemCategory.Consumable),
                ...cm.getInventoryByType(ItemCategory.Accessory),
                ...cm.getInventoryByType(ItemCategory.Material)
            ].filter(i => this.currentFilter === 'ALL' || i.itemData.category === this.currentFilter);
        }
    }

    private renderFilterPill(id: string, label: string): string {
        if (this.mode === 'BUY' && id === ItemCategory.Material) return '';
        const isActive = this.currentFilter === id;
        return `
            <button class="t-filter-pill" data-filter="${id}"
                    style="background: ${isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent'}; 
                           border: 1px solid ${isActive ? 'var(--t-blue)' : 'var(--t-border)'}; 
                           color: ${isActive ? 'var(--t-text-main)' : 'var(--t-text-muted)'}; 
                           padding: 8px 18px; 
                           border-radius: 100px; 
                           font-size: 10px; 
                           font-weight: 800; 
                           cursor: pointer; 
                           transition: 0.2s;">
                ${label.toUpperCase()}
            </button>
        `;
    }

    private renderShopCard(item: InventoryItem): string {
        const isSell = this.mode === 'SELL';
        const data = item.itemData;
        const price = isSell ? Math.floor(data.price * 0.5) : data.price;
        const icon = data.iconKey || '📦';
        
        // Buy: Check if user has gold AND shop has stock
        // Sell: Always have stock if in inventory
        const hasStock = item.quantity > 0;
        const canAfford = isSell || (ClanManager.getInstance().getGold() >= price && hasStock);

        // Build Tooltip
        let extraInfo = '';
        if (data.statModifiers) {
            extraInfo = data.statModifiers.map((s: any) => `<div style='font-size:10px; color: var(--t-blue);'>+${s.value} ${s.stat}</div>`).join('');
        } else if (data.power) {
            const type = data.typeAction === 'HEAL' ? 'Soin' : 'Dégâts';
            extraInfo = `<div style='font-size:10px; color: var(--t-red);'>${type} : ${data.power}</div>`;
        }

        const tooltipContent = `
            <div style="font-weight: 800; color: ${data.category === 'Accessory' ? 'var(--t-gold)' : 'var(--t-text-main)'}; margin-bottom:4px; font-size: 16px;">${data.itemName}</div>
            <div style="font-size: 12px; margin-bottom:8px; opacity: 0.9; color: #fff;">${data.description}</div>
            ${extraInfo}
        `;

        return `
            <div data-tooltip-content="${encodeURIComponent(tooltipContent)}" style="background: rgba(255,255,255,0.02); border: 1px solid var(--t-border); border-radius: 20px; padding: 20px; display: flex; align-items: center; gap: 20px; transition: 0.2s;" onmouseover="this.style.borderColor='var(--t-border-bright)'" onmouseout="this.style.borderColor='var(--t-border)'">
                <div style="width: 64px; height: 64px; background: rgba(0,0,0,0.3); border: 1px solid var(--t-border); border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 32px;">
                    ${icon}
                </div>
                
                <div style="flex: 1;">
                    <div style="font-size: 9px; font-weight: 900; color: var(--t-text-dim); text-transform: uppercase; margin-bottom: 2px;">${data.category}</div>
                    <div style="font-size: 16px; font-weight: 800; color: var(--t-text-main);">${data.itemName}</div>
                    <div style="font-size: 13px; font-weight: 900; color: var(--t-gold); margin-top: 4px;">${price} 🪙</div>
                    <div style="font-size:10px; color: ${hasStock ? 'var(--t-text-muted)' : 'var(--t-red)'}; margin-top:2px; font-weight: 700;">
                        Stock: ${item.quantity}
                    </div>
                </div>

                <button class="t-shop-action-btn" data-id="${data.id}" data-category="${data.category}"
                    style="padding: 10px 20px; background: ${canAfford ? 'var(--t-panel-dark)' : 'transparent'}; border: 1px solid ${canAfford ? 'var(--t-border-bright)' : 'var(--t-red)'}; border-radius: 10px; color: ${canAfford ? 'var(--t-text-main)' : 'var(--t-red)'}; font-size: 10px; font-weight: 900; cursor: ${canAfford ? 'pointer' : 'not-allowed'}; transition: 0.2s; opacity: ${canAfford ? '1' : '0.5'};" 
                    ${!canAfford ? 'disabled' : ''}>
                    ${this.mode === 'BUY' ? 'ACHETER' : (hasStock ? 'VENDRE' : 'ÉPUISÉ')}
                </button>
            </div>
        `;
    }

    private renderEmptyState(): string {
        return `<div style="grid-column: span 2; padding: 100px; text-align: center; opacity: 0.2; font-weight: 800; font-size: 16px; text-transform: uppercase;">Aucun article disponible</div>`;
    }

    private attachEvents(): void {
        document.getElementById('shop-buy-mode')?.addEventListener('click', () => { 
            this.mode = 'BUY'; 
            this.currentFilter = 'ALL';
            this.currentPage = 0; 
            this.render(); 
        });
        document.getElementById('shop-sell-mode')?.addEventListener('click', () => { 
            this.mode = 'SELL'; 
            this.currentFilter = 'ALL';
            this.currentPage = 0; 
            this.render(); 
        });
        
        this.container.querySelectorAll('.t-filter-pill').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentFilter = (e.currentTarget as HTMLElement).dataset.filter as any;
                this.currentPage = 0;
                this.render();
            });
        });

        this.container.querySelector('.t-shop-prev')?.addEventListener('click', () => {
            if (this.currentPage > 0) {
                this.currentPage--;
                this.render();
            }
        });

        this.container.querySelector('.t-shop-next')?.addEventListener('click', () => {
            this.currentPage++;
            this.render();
        });

        this.container.querySelectorAll('.t-shop-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const id = target.dataset.id!;
                const category = target.dataset.category as ItemCategory;
                this.handleTransaction(id, category);
            });
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

    private handleTransaction(itemId: string, category: ItemCategory): void {
        const cm = ClanManager.getInstance();
        const dm = DataManager.getInstance();
        const itemData = dm.getItemData(itemId);

        if (!itemData) return;

        if (this.mode === 'BUY') {
            const shopItem = this.availableItems.find(i => i.id === itemId);
            if (shopItem && shopItem.qty > 0) {
                if (cm.spendGold(itemData.price)) {
                    cm.addItem(itemData);
                    shopItem.qty--; // Decrement local stock
                    MenuManager.getInstance().refreshGoldDisplay();
                    this.showNotification(`Achat réussi : ${itemData.itemName}`, 'success');
                    this.render();
                } else {
                    this.showNotification(`Fonds insuffisants pour acheter ${itemData.itemName}`, 'error');
                }
            }
        } else {
            const sellPrice = Math.floor(itemData.price * 0.5);
            if (cm.removeItem(itemId, category)) {
                cm.addGold(sellPrice);
                MenuManager.getInstance().refreshGoldDisplay();
                this.showNotification(`Vente réussie : ${itemData.itemName} (+${sellPrice} or)`, 'success');
                // We could increase shop stock? Usually shops don't keep track of sold items unless specifically designed.
                // For now, we assume sold items disappear.
                this.render();
            }
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
        if (this.notificationContainer) this.notificationContainer.remove();
        this.container.remove();
    }
}
