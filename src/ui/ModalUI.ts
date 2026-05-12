/**
 * ModalUI.ts
 * Generic system for displaying blocking modals, confirmations, and toast notifications.
 */

export class ModalUI {
    
    // ─── Utilities ───────────────────────────────────────────────────────────

    private static createBackdrop(id: string): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.id = id;
        backdrop.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px);
            z-index: 9999; display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.3s ease;
        `;
        document.body.appendChild(backdrop);
        
        // Trigger fade in
        requestAnimationFrame(() => backdrop.style.opacity = '1');
        
        return backdrop;
    }

    private static close(element: HTMLElement): void {
        element.style.opacity = '0';
        setTimeout(() => {
            if (element.parentNode) element.parentNode.removeChild(element);
        }, 300);
    }

    // ─── Public Methods ──────────────────────────────────────────────────────

    /**
     * Show a confirmation dialog with Yes/No buttons.
     */
    public static showConfirm(title: string, message: string, onConfirm: () => void, confirmLabel: string = "CONFIRMER", cancelLabel: string = "ANNULER", danger: boolean = false): void {
        const backdrop = this.createBackdrop('modal-confirm-backdrop');
        
        const content = `
            <div style="
                background: #1e293b; border: 1px solid #334155; border-radius: 16px;
                padding: 30px; width: 400px; max-width: 90%;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5); transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            " id="modal-content">
                <div style="font-size: 24px; font-weight: 800; color: white; margin-bottom: 10px;">${title}</div>
                <div style="font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 30px;">
                    ${message}
                </div>
                <div style="display: flex; gap: 15px; justify-content: flex-end;">
                    <button id="modal-btn-cancel" style="
                        background: transparent; border: 1px solid #475569; color: #cbd5e1;
                        padding: 12px 20px; border-radius: 10px; font-weight: 700; cursor: pointer;
                        transition: all 0.2s;
                    ">
                        ${cancelLabel}
                    </button>
                    <button id="modal-btn-confirm" style="
                        background: ${danger ? '#ef4444' : '#3b82f6'}; 
                        border: none; color: white;
                        padding: 12px 20px; border-radius: 10px; font-weight: 700; cursor: pointer;
                        box-shadow: 0 4px 12px ${danger ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)'};
                        transition: all 0.2s;
                    ">
                        ${confirmLabel}
                    </button>
                </div>
            </div>
        `;
        
        backdrop.innerHTML = content;
        
        // Animation pop
        const modalContent = backdrop.querySelector('#modal-content') as HTMLElement;
        requestAnimationFrame(() => modalContent.style.transform = 'scale(1)');

        // Bind Events
        const cancelBtn = backdrop.querySelector('#modal-btn-cancel') as HTMLElement;
        const confirmBtn = backdrop.querySelector('#modal-btn-confirm') as HTMLElement;

        cancelBtn.addEventListener('click', () => this.close(backdrop));
        
        confirmBtn.addEventListener('click', () => {
            onConfirm();
            this.close(backdrop);
        });
    }

    /**
     * Show a persistent loader or a temporary success message.
     * If duration is provided, it resolves after duration.
     * If duration is 0, it stays until manually closed (returns a closer function? No, promise is better for sequencing).
     */
    public static async showLoader(message: string, duration: number = 0): Promise<void> {
        const backdrop = this.createBackdrop('modal-loader-backdrop');
        
        const content = `
            <div style="
                display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px;
                transform: scale(0.9); transition: transform 0.3s ease;
            " id="modal-content">
                <div class="spinner" style="
                    width: 50px; height: 50px; border: 4px solid rgba(255,255,255,0.1);
                    border-left-color: #3b82f6; border-radius: 50%;
                    animation: spin 1s linear infinite;
                "></div>
                <div style="font-size: 18px; font-weight: 700; color: white; text-align: center;">${message}</div>
            </div>
            <style>
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        `;
        
        backdrop.innerHTML = content;
        const modalContent = backdrop.querySelector('#modal-content') as HTMLElement;
        requestAnimationFrame(() => modalContent.style.transform = 'scale(1)');

        if (duration > 0) {
            return new Promise(resolve => {
                setTimeout(() => {
                    this.close(backdrop);
                    resolve();
                }, duration);
            });
        }
    }

    /**
     * Show a simple Toast/Notification at bottom center.
     */
    public static showToast(message: string, type: 'success' | 'error' = 'success'): void {
        const toast = document.createElement('div');
        const color = type === 'success' ? '#22c55e' : '#ef4444';
        
        toast.style.cssText = `
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(20px);
            background: #0f172a; border: 1px solid ${color}; color: white;
            padding: 12px 24px; border-radius: 50px; font-weight: 600; font-size: 14px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 10000;
            display: flex; align-items: center; gap: 10px;
            opacity: 0; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        `;
        
        toast.innerHTML = `
            <span style="color: ${color}; font-size: 18px;">${type === 'success' ? '✓' : '✕'}</span>
            ${message}
        `;
        
        document.body.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(-50%) translateY(0)';
            toast.style.opacity = '1';
        });
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(10px)';
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 3000);
    }
}
