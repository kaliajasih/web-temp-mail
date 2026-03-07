/* ========================================
   TempMail — Frontend Application
   ======================================== */

(function () {
    'use strict';

    // ===== Constants =====
    const EXPIRY_MINUTES = 30;

    // ===== State =====
    let currentEmail = null;
    let currentRouteId = null;
    let currentCreatedAt = null;
    let countdownInterval = null;
    let expiryInterval = null;
    let countdown = 5;

    // ===== DOM Elements =====
    const $ = (sel) => document.querySelector(sel);
    const emailPlaceholder = $('#emailPlaceholder');
    const emailAddress = $('#emailAddress');
    const emailText = $('#emailText');
    const btnGenerate = $('#btnGenerate');
    const btnCopy = $('#btnCopy');
    const copyFeedback = $('#copyFeedback');
    const timerInfo = $('#timerInfo');
    const timerText = $('#timerText');
    const generatorCard = $('#generatorCard');
    const inboxSection = $('#inboxSection');
    const inboxLoading = $('#inboxLoading');
    const inboxEmpty = $('#inboxEmpty');
    const emailList = $('#emailList');
    const emailCount = $('#emailCount');
    const btnRefresh = $('#btnRefresh');
    const modalOverlay = $('#modalOverlay');
    const modalSubject = $('#modalSubject');
    const modalFrom = $('#modalFrom');
    const modalDate = $('#modalDate');
    const emailBodyContent = $('#emailBodyContent');
    const modalAttachments = $('#modalAttachments');
    const attachmentList = $('#attachmentList');
    const btnCloseModal = $('#btnCloseModal');
    const expiryTimer = $('#expiryTimer');
    const expiryTimeText = $('#expiryTimeText');
    const expiryProgressFill = $('#expiryProgressFill');

    // ===== API Helpers =====
    async function apiCall(endpoint) {
        try {
            const res = await fetch(endpoint);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            console.error(`API Error [${endpoint}]:`, err);
            return { success: false, error: err.message };
        }
    }

    // ===== Toast Notification =====
    function showToast(message, type = 'info') {
        const existing = document.querySelector('.toast-notification');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            padding: 14px 24px;
            border-radius: 12px;
            font-family: 'Inter', sans-serif;
            font-size: 0.85rem;
            font-weight: 500;
            z-index: 2000;
            animation: fadeInUp 0.3s ease-out;
            max-width: 90%;
            text-align: center;
            backdrop-filter: blur(16px);
            ${type === 'error'
                ? 'background: rgba(255, 107, 107, 0.15); color: #ff6b6b; border: 1px solid rgba(255, 107, 107, 0.3);'
                : type === 'success'
                    ? 'background: rgba(0, 206, 201, 0.15); color: #00cec9; border: 1px solid rgba(0, 206, 201, 0.3);'
                    : 'background: rgba(108, 92, 231, 0.15); color: #a29bfe; border: 1px solid rgba(108, 92, 231, 0.3);'
            }
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // ===== Generate Email =====
    async function generateEmail() {
        btnGenerate.classList.add('loading');
        btnGenerate.disabled = true;

        const data = await apiCall('/api/generate');

        btnGenerate.classList.remove('loading');
        btnGenerate.disabled = false;

        if (data.success) {
            currentEmail = data.email;
            currentRouteId = data.routeId;
            currentCreatedAt = data.createdAt;

            // Save to localStorage
            localStorage.setItem('tempmail_current', currentEmail);
            localStorage.setItem('tempmail_routeId', currentRouteId || '');
            localStorage.setItem('tempmail_createdAt', currentCreatedAt || '');

            // Update UI
            emailPlaceholder.style.display = 'none';
            emailAddress.style.display = 'flex';
            emailText.textContent = currentEmail;
            generatorCard.classList.add('active');

            // Show inbox
            inboxSection.style.display = 'block';
            inboxSection.style.animation = 'fadeInUp 0.4s ease-out';

            // Show timer
            timerInfo.style.display = 'flex';

            // Start expiry timer
            startExpiryTimer();

            // Start auto-refresh
            startAutoRefresh();

            // Immediate first fetch
            fetchInbox();

            showToast('✅ Email created! Auto-deletes in 30 minutes', 'success');
        } else {
            showToast(`❌ ${data.details || data.error || 'Failed to generate email'}`, 'error');
        }
    }

    // ===== Reset UI to Initial State =====
    function resetToInitial() {
        currentEmail = null;
        currentRouteId = null;
        currentCreatedAt = null;

        // Clear localStorage
        localStorage.removeItem('tempmail_current');
        localStorage.removeItem('tempmail_routeId');
        localStorage.removeItem('tempmail_createdAt');

        // Reset UI
        emailPlaceholder.style.display = 'flex';
        emailAddress.style.display = 'none';
        emailText.textContent = '';
        generatorCard.classList.remove('active');

        // Hide inbox
        inboxSection.style.display = 'none';
        emailList.innerHTML = '';
        emailCount.textContent = '0 messages';
        inboxEmpty.style.display = 'block';

        // Hide timers
        timerInfo.style.display = 'none';
        stopExpiryTimer();
        stopAutoRefresh();
    }

    // ===== Copy Email =====
    function copyEmail() {
        if (!currentEmail) return;

        navigator.clipboard.writeText(currentEmail).then(() => {
            copyFeedback.classList.add('show');
            setTimeout(() => copyFeedback.classList.remove('show'), 1500);
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = currentEmail;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            copyFeedback.classList.add('show');
            setTimeout(() => copyFeedback.classList.remove('show'), 1500);
        });
    }

    // ===== Fetch Inbox =====
    async function fetchInbox() {
        if (!currentEmail) return;

        inboxLoading.style.display = 'flex';

        const data = await apiCall(`/api/inbox?email=${encodeURIComponent(currentEmail)}`);

        inboxLoading.style.display = 'none';

        if (data.success) {
            const emails = data.emails || [];
            emailCount.textContent = `${emails.length} message${emails.length !== 1 ? 's' : ''}`;

            if (emails.length === 0) {
                inboxEmpty.style.display = 'block';
                emailList.innerHTML = '';
            } else {
                inboxEmpty.style.display = 'none';
                renderEmailList(emails);
            }
        }
    }

    // ===== Render Email List =====
    function renderEmailList(emails) {
        emailList.innerHTML = emails.map((email, index) => {
            const senderName = extractSenderName(email.from);
            const initial = senderName.charAt(0).toUpperCase();
            const timeAgo = formatTimeAgo(email.date);
            const isUnread = !email.isRead;

            return `
        <div class="email-item ${isUnread ? 'unread' : ''}" 
             data-id="${email.id}" 
             style="animation-delay: ${index * 50}ms"
             onclick="window.__openEmail('${email.id}')">
          <div class="email-avatar">${initial}</div>
          <div class="email-info">
            <div class="email-info-top">
              <span class="email-sender">${escapeHtml(senderName)}</span>
              <span class="email-time">${timeAgo}</span>
            </div>
            <div class="email-subject">${escapeHtml(email.subject)}</div>
            <div class="email-snippet">${escapeHtml(email.snippet)}</div>
          </div>
        </div>
      `;
        }).join('');
    }

    // ===== Open Email Detail =====
    window.__openEmail = async function (emailId) {
        modalOverlay.classList.add('active');
        emailBodyContent.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:40px;color:var(--text-muted)">
        <div class="loading-spinner"></div>
        <span>Loading email content...</span>
      </div>
    `;
        modalAttachments.style.display = 'none';

        const data = await apiCall(`/api/email?id=${emailId}`);

        if (data.success && data.email) {
            const email = data.email;
            modalSubject.textContent = email.subject;
            modalFrom.textContent = `From: ${email.from}`;
            modalDate.textContent = `Date: ${formatDate(email.date)}`;

            if (email.htmlBody) {
                const iframe = document.createElement('iframe');
                iframe.sandbox = 'allow-same-origin';
                iframe.style.cssText = 'width:100%;border:none;border-radius:12px;background:white;min-height:300px;';
                emailBodyContent.innerHTML = '';
                emailBodyContent.appendChild(iframe);

                setTimeout(() => {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    doc.open();
                    doc.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { 
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
                  padding: 20px; margin: 0; color: #333;
                  font-size: 14px; line-height: 1.6;
                }
                img { max-width: 100%; height: auto; }
                a { color: #6c5ce7; }
              </style>
            </head>
            <body>${email.htmlBody}</body>
            </html>
          `);
                    doc.close();

                    const resizeObserver = new ResizeObserver(() => {
                        iframe.style.height = doc.body.scrollHeight + 40 + 'px';
                    });
                    resizeObserver.observe(doc.body);
                    iframe.style.height = doc.body.scrollHeight + 40 + 'px';
                }, 50);
            } else if (email.textBody) {
                emailBodyContent.innerHTML = `<pre>${escapeHtml(email.textBody)}</pre>`;
            } else {
                emailBodyContent.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:40px">No content available</p>`;
            }

            if (email.attachments && email.attachments.length > 0) {
                modalAttachments.style.display = 'block';
                attachmentList.innerHTML = email.attachments.map(att => `
          <span class="attachment-item">
            📄 ${escapeHtml(att.filename)} (${formatBytes(att.size)})
          </span>
        `).join('');
            }
        } else {
            emailBodyContent.innerHTML = `
        <p style="color:var(--danger);text-align:center;padding:40px">
          Failed to load email content
        </p>
      `;
        }
    };

    // ===== Close Modal =====
    function closeModal() {
        modalOverlay.classList.remove('active');
    }

    // ===== Auto Refresh =====
    function startAutoRefresh() {
        stopAutoRefresh();
        countdown = 5;
        updateCountdown();

        countdownInterval = setInterval(() => {
            countdown--;
            updateCountdown();
            if (countdown <= 0) {
                fetchInbox();
                countdown = 5;
            }
        }, 1000);
    }

    function stopAutoRefresh() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    function updateCountdown() {
        timerText.textContent = `Auto-refresh in ${countdown}s`;
    }

    // ===== Expiry Timer =====
    function startExpiryTimer() {
        stopExpiryTimer();
        expiryTimer.style.display = 'block';
        updateExpiryDisplay();

        expiryInterval = setInterval(() => {
            const remaining = getExpiryRemaining();
            if (remaining <= 0) {
                showToast('⏰ Email expired — generating new one...', 'info');
                resetToInitial();
                return;
            }
            updateExpiryDisplay();
        }, 1000);
    }

    function stopExpiryTimer() {
        if (expiryInterval) {
            clearInterval(expiryInterval);
            expiryInterval = null;
        }
        expiryTimer.style.display = 'none';
    }

    function getExpiryRemaining() {
        if (!currentCreatedAt) return 0;
        const created = new Date(currentCreatedAt);
        const expiresAt = new Date(created.getTime() + EXPIRY_MINUTES * 60 * 1000);
        return Math.max(0, expiresAt - new Date());
    }

    function updateExpiryDisplay() {
        const remainingMs = getExpiryRemaining();
        const totalMs = EXPIRY_MINUTES * 60 * 1000;
        const remainingSec = Math.ceil(remainingMs / 1000);
        const minutes = Math.floor(remainingSec / 60);
        const seconds = remainingSec % 60;

        expiryTimeText.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        const progress = (remainingMs / totalMs) * 100;
        expiryProgressFill.style.width = `${progress}%`;

        if (progress <= 15) {
            expiryProgressFill.style.background = 'var(--danger)';
            expiryTimer.classList.add('expiry-critical');
            expiryTimer.classList.remove('expiry-warning');
        } else if (progress <= 40) {
            expiryProgressFill.style.background = 'var(--warning)';
            expiryTimer.classList.add('expiry-warning');
            expiryTimer.classList.remove('expiry-critical');
        } else {
            expiryProgressFill.style.background = '';
            expiryTimer.classList.remove('expiry-warning', 'expiry-critical');
        }
    }

    // ===== Manual Refresh =====
    async function manualRefresh() {
        btnRefresh.classList.add('spinning');
        await fetchInbox();
        btnRefresh.classList.remove('spinning');
        countdown = 5;
    }

    // ===== Utility Functions =====
    function extractSenderName(from) {
        if (!from) return '?';
        const match = from.match(/^"?([^"<]+)"?\s*</);
        if (match) return match[1].trim();
        const emailMatch = from.match(/([^@]+)@/);
        if (emailMatch) return emailMatch[1];
        return from;
    }

    function formatTimeAgo(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long',
            day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    }

    function formatBytes(bytes) {
        if (!bytes) return '0 B';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ===== Event Listeners =====
    btnGenerate.addEventListener('click', generateEmail);
    btnCopy.addEventListener('click', copyEmail);
    btnRefresh.addEventListener('click', manualRefresh);
    btnCloseModal.addEventListener('click', closeModal);

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // ===== Restored Session =====
    const savedEmail = localStorage.getItem('tempmail_current');
    const savedRouteId = localStorage.getItem('tempmail_routeId');
    const savedCreatedAt = localStorage.getItem('tempmail_createdAt');

    if (savedEmail) {
        currentEmail = savedEmail;
        currentRouteId = savedRouteId;
        currentCreatedAt = savedCreatedAt;

        // Check if expired
        if (currentCreatedAt && getExpiryRemaining() <= 0) {
            showToast('⏰ Previous email has expired', 'info');
            resetToInitial();
        } else {
            emailPlaceholder.style.display = 'none';
            emailAddress.style.display = 'flex';
            emailText.textContent = currentEmail;
            generatorCard.classList.add('active');
            inboxSection.style.display = 'block';
            timerInfo.style.display = 'flex';
            startExpiryTimer();
            startAutoRefresh();
            fetchInbox();
        }
    }

})();
