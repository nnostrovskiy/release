// background.js
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 час
const GITHUB_REPO = 'nnostrovskiy/release';
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
            console.log('Checking for updates from:', UPDATE_URL);
            const response = await fetch(UPDATE_URL, {
                method: 'GET',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Yandex-Search-Extension'
                }
            });
            
            console.log('Response status:', response.status, response.statusText);
            
            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error('Rate limit exceeded. Please try again later.');
                } else if (response.status === 404) {
                    throw new Error('Repository or release not found. Check repository name.');
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }
            
            const releaseData = await response.json();
            console.log('Latest release:', releaseData.tag_name);
            
            const latestVersion = this.extractVersion(releaseData.tag_name);
            
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
                return { 
                    available: true, 
                    version: latestVersion,
                    currentVersion: this.currentVersion
                };
            } else {
                await this.storeUpdateInfo({
                    available: false,
                    lastChecked: new Date().toISOString(),
                    currentVersion: this.currentVersion
                });
                return { 
                    available: false,
                    currentVersion: this.currentVersion
                };
            }
        } catch (error) {
            console.error('Update check failed:', error);
            const errorInfo = {
                available: false, 
                error: error.message,
                lastChecked: new Date().toISOString(),
                currentVersion: this.currentVersion
            };
            await this.storeUpdateInfo(errorInfo);
            return errorInfo;
        }
    }

    extractVersion(tagName) {
        // Извлекаем версию из тега (поддерживает v1.0.0, 1.0.0, и другие форматы)
        const versionMatch = tagName.match(/v?(\d+\.\d+\.\d+)/);
        return versionMatch ? versionMatch[1] : tagName.replace(/^v/, '');
    }

    isNewerVersion(newVersion, currentVersion) {
        try {
            const newParts = newVersion.split('.').map(Number);
            const currentParts = currentVersion.split('.').map(Number);
            
            for (let i = 0; i < Math.max(newParts.length, currentParts.length); i++) {
                const newPart = newParts[i] || 0;
                const currentPart = currentParts[i] || 0;
                
                if (newPart > currentPart) return true;
                if (newPart < currentPart) return false;
            }
            return false;
        } catch (error) {
            console.error('Version comparison error:', error);
            return false;
        }
    }

    async storeUpdateInfo(info) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ updateInfo: info }, resolve);
        });
    }

    async getStoredUpdateInfo() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['updateInfo'], (result) => {
                resolve(result.updateInfo || { 
                    available: false, 
                    currentVersion: chrome.runtime.getManifest().version 
                });
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
                if (chrome.runtime.lastError) {
                    console.log('Notification error:', chrome.runtime.lastError);
                    return;
                }
                
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
