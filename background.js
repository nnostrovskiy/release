// background.js
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 час
const GITHUB_REPO = 'yourusername/yandex-search-extension';
const UPDATE_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

class UpdateManager {
    constructor() {
        this.currentVersion = chrome.runtime.getManifest().version;
        this.init();
    }

    async init() {
        // Проверяем обновления при запуске
        await this.checkForUpdates();
        
        // Периодическая проверка
        setInterval(() => this.checkForUpdates(), UPDATE_CHECK_INTERVAL);
        
        // Слушаем сообщения от popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'checkForUpdates') {
                this.checkForUpdates().then(sendResponse);
                return true;
            }
            if (request.action === 'getUpdateInfo') {
                this.getStoredUpdateInfo().then(sendResponse);
                return true;
            }
        });
    }

    async checkForUpdates() {
        try {
            const response = await fetch(UPDATE_URL);
            if (!response.ok) throw new Error('Network response was not ok');
            
            const releaseData = await response.json();
            const latestVersion = releaseData.tag_name.replace('v', '');
            
            if (this.isNewerVersion(latestVersion, this.currentVersion)) {
                await this.storeUpdateInfo({
                    available: true,
                    version: latestVersion,
                    url: releaseData.html_url,
                    releaseNotes: releaseData.body,
                    assets: releaseData.assets,
                    lastChecked: new Date().toISOString()
                });
                
                this.showUpdateNotification(latestVersion);
                return { available: true, version: latestVersion };
            } else {
                await this.storeUpdateInfo({
                    available: false,
                    lastChecked: new Date().toISOString()
                });
                return { available: false };
            }
        } catch (error) {
            console.error('Update check failed:', error);
            return { available: false, error: error.message };
        }
    }

    isNewerVersion(newVersion, currentVersion) {
        const newParts = newVersion.split('.').map(Number);
        const currentParts = currentVersion.split('.').map(Number);
        
        for (let i = 0; i < newParts.length; i++) {
            if ((newParts[i] || 0) > (currentParts[i] || 0)) return true;
            if ((newParts[i] || 0) < (currentParts[i] || 0)) return false;
        }
        return false;
    }

    async storeUpdateInfo(info) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ updateInfo: info }, resolve);
        });
    }

    async getStoredUpdateInfo() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['updateInfo'], (result) => {
                resolve(result.updateInfo || { available: false });
            });
        });
    }

    showUpdateNotification(version) {
        if (chrome.notifications) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'Доступно обновление',
                message: `Версия ${version} готова к загрузке`,
                buttons: [
                    { title: 'Скачать' },
                    { title: 'Позже' }
                ]
            }, (notificationId) => {
                chrome.notifications.onButtonClicked.addListener((clickedId, buttonIndex) => {
                    if (clickedId === notificationId && buttonIndex === 0) {
                        chrome.tabs.create({ url: `https://github.com/${GITHUB_REPO}/releases` });
                    }
                });
                
                chrome.notifications.onClicked.addListener((clickedId) => {
                    if (clickedId === notificationId) {
                        chrome.tabs.create({ url: `https://github.com/${GITHUB_REPO}/releases` });
                    }
                });
            });
        }
    }
}

// Инициализируем менеджер обновлений
new UpdateManager();