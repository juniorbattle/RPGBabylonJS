/**
 * JournalUI.ts
 * Quest Log interface showing active and completed quests.
 */

import { QuestManager, QuestStatus, Quest } from '../data/QuestManager';

export class JournalUI {
    private root: HTMLElement;
    private content: HTMLElement;
    private activeTab: 'active' | 'completed' = 'active';
    private selectedQuestId: string | null = null;

    constructor(parent: HTMLElement) {
        this.root = document.createElement('div');
        this.root.style.cssText = `
            width: 100%; height: 100%; display: flex; flex-direction: column;
            color: #fff; font-family: 'Segoe UI', sans-serif;
        `;
        
        this.content = document.createElement('div');
        this.content.style.cssText = `flex: 1; display: flex; gap: 20px; padding: 20px; overflow: hidden;`;
        
        parent.innerHTML = ''; // Clear previous content
        parent.appendChild(this.root);
        
        this.renderHeader();
        this.renderContent();
    }

    private renderHeader(): void {
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex; gap: 20px; padding: 0 20px 20px 20px; 
            border-bottom: 1px solid rgba(255,255,255,0.1);
        `;

        const btnActive = this.createTabBtn('EN COURS', 'active');
        const btnCompleted = this.createTabBtn('TERMINÉES', 'completed');

        header.appendChild(btnActive);
        header.appendChild(btnCompleted);
        this.root.appendChild(header);
    }

    private createTabBtn(label: string, id: 'active' | 'completed'): HTMLElement {
        const btn = document.createElement('button');
        const isActive = this.activeTab === id;
        btn.textContent = label;
        btn.style.cssText = `
            background: ${isActive ? 'var(--t-blue)' : 'transparent'};
            color: ${isActive ? '#fff' : '#94a3b8'};
            border: 1px solid ${isActive ? 'transparent' : 'rgba(255,255,255,0.1)'};
            padding: 10px 20px; border-radius: 8px; cursor: pointer;
            font-weight: 800; font-size: 12px; transition: 0.2s;
        `;
        btn.onclick = () => {
            this.activeTab = id;
            this.selectedQuestId = null;
            this.root.innerHTML = '';
            this.renderHeader();
            this.renderContent();
        };
        return btn;
    }

    private renderContent(): void {
        this.content.innerHTML = '';
        const qm = QuestManager.getInstance();
        const all = qm.getAllQuests();
        const filtered = all.filter(q => 
            this.activeTab === 'active' ? q.status === QuestStatus.ACTIVE : q.status === QuestStatus.COMPLETED
        );

        // Select first if none selected
        if (!this.selectedQuestId && filtered.length > 0) {
            this.selectedQuestId = filtered[0].id;
        }

        const list = this.renderList(filtered);
        const detail = this.renderDetail(filtered.find(q => q.id === this.selectedQuestId));

        this.content.appendChild(list);
        this.content.appendChild(detail);
        this.root.appendChild(this.content);
    }

    private renderList(quests: Quest[]): HTMLElement {
        const container = document.createElement('div');
        container.className = 't-scrollbar';
        container.style.cssText = `width: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;`;

        if (quests.length === 0) {
            container.innerHTML = `<div style="opacity:0.5; text-align:center; margin-top:50px;">Aucune quête.</div>`;
            return container;
        }

        quests.forEach(q => {
            const item = document.createElement('div');
            const isSelected = q.id === this.selectedQuestId;
            item.style.cssText = `
                padding: 15px; border-radius: 12px; cursor: pointer;
                background: ${isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.02)'};
                border: 1px solid ${isSelected ? 'var(--t-blue)' : 'rgba(255,255,255,0.05)'};
                transition: 0.2s;
            `;
            item.innerHTML = `
                <div style="font-weight: 800; font-size: 14px; color: ${isSelected ? '#fff' : '#cbd5e1'}; margin-bottom: 4px;">${q.title}</div>
                <div style="font-size: 11px; color: ${isSelected ? 'var(--t-blue)' : '#64748b'};">
                    ${q.status === QuestStatus.COMPLETED ? 'Terminée' : `Étape ${q.currentStepIndex + 1}/${q.steps.length}`}
                </div>
            `;
            item.onclick = () => {
                this.selectedQuestId = q.id;
                this.renderContent(); // Re-render to update details
            };
            container.appendChild(item);
        });

        return container;
    }

    private renderDetail(quest?: Quest): HTMLElement {
        const container = document.createElement('div');
        container.className = 't-scrollbar';
        container.style.cssText = `flex: 1; background: rgba(0,0,0,0.2); border-radius: 16px; padding: 30px; overflow-y: auto;`;

        if (!quest) {
            container.innerHTML = `<div style="opacity:0.5; display:flex; justify-content:center; align-items:center; height:100%;">Sélectionnez une quête</div>`;
            return container;
        }

        container.innerHTML = `
            <h1 style="font-size: 28px; font-weight: 900; margin-bottom: 10px; color: var(--t-gold);">${quest.title}</h1>
            <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-bottom: 30px;">${quest.description}</p>
            
            <h3 style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 15px; letter-spacing: 1px;">Progression</h3>
            
            <div style="display: flex; flex-direction: column; gap: 15px;">
                ${quest.steps.map((step, idx) => {
                    const isDone = step.completed;
                    const isCurrent = idx === quest.currentStepIndex && quest.status === QuestStatus.ACTIVE;
                    const statusIcon = isDone ? '✅' : (isCurrent ? '👉' : '🔒');
                    const color = isDone ? '#4ade80' : (isCurrent ? '#fff' : '#64748b');
                    
                    return `
                        <div style="display: flex; gap: 15px; align-items: center; opacity: ${isDone || isCurrent ? '1' : '0.5'};">
                            <div style="font-size: 20px;">${statusIcon}</div>
                            <div style="flex: 1; padding: 15px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid ${isCurrent ? 'var(--t-blue)' : 'transparent'};">
                                <div style="font-size: 13px; font-weight: ${isCurrent ? '700' : '400'}; color: ${color};">
                                    ${step.description}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        if (quest.status === QuestStatus.COMPLETED) {
            container.innerHTML += `
                <div style="margin-top: 40px; padding: 20px; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 12px; display: flex; align-items: center; gap: 15px;">
                    <div style="font-size: 30px;">🏆</div>
                    <div>
                        <div style="font-weight: 800; color: #4ade80;">QUÊTE ACCOMPLIE</div>
                        <div style="font-size: 12px; color: #bbf7d0;">Vous avez terminé cette histoire.</div>
                    </div>
                </div>
            `;
        }

        return container;
    }
}
