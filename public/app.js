/* ========================================
   TempMail — Frontend Application
   ======================================== */

// ===== reCAPTCHA v2 Callback (must be global) =====
function onRecaptchaSuccess(token) {
    window.__recaptchaToken = token;
    const btnGenerate = document.getElementById('btnGenerate');
    const generateStep = document.getElementById('generateStep');
    if (btnGenerate) {
        btnGenerate.disabled = false;
        btnGenerate.classList.add('ready');
    }
    if (generateStep) {
        generateStep.classList.add('step-active');
    }
}

(function () {
    'use strict';

    // ===== Constants =====
    const EXPIRY_MINUTES = 30;
    const DAILY_LIMIT = 20;

    // ===== State =====
    let currentEmail = null;
    let currentRouteId = null;
    let currentCreatedAt = null;
    let countdownInterval = null;
    let expiryInterval = null;
    let countdown = 30;
    let recaptchaSiteKey = '6Lclx4IsAAAAAKS3ShIMPdgalLycnLtrx0oqnU9P';

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
    const rateLimitBadge = $('#rateLimitBadge');
    const generateStep = $('#generateStep');
    const recaptchaWidget = $('#recaptchaWidget');

    // ===== Load reCAPTCHA dynamically =====
    async function loadRecaptcha() {
        try {
            const res = await fetch('/api/config');
            const config = await res.json();
            recaptchaSiteKey = config.recaptchaSiteKey;

            if (!recaptchaSiteKey) {
                // No reCAPTCHA configured — allow generate without captcha
                btnGenerate.disabled = false;
                generateStep.classList.add('step-active');
                const recaptchaStep = $('#recaptchaStep');
                if (recaptchaStep) recaptchaStep.style.display = 'none';
                return;
            }

            // Load Google reCAPTCHA script
            const script = document.createElement('script');
            script.src = 'https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoaded&render=explicit';
            script.async = true;
            script.defer = true;
            document.head.appendChild(script);

            // Callback when script is loaded
            window.onRecaptchaLoaded = function () {
                grecaptcha.render('recaptchaWidget', {
                    sitekey: recaptchaSiteKey,
                    callback: onRecaptchaSuccess,
                    theme: 'dark'
                });
            };
        } catch (e) {
            console.error('Failed to load config:', e);
            // Allow generate without captcha on error
            btnGenerate.disabled = false;
            generateStep.classList.add('step-active');
        }
    }

    // ===== Rate Limiting =====
    function getRateLimitData() {
        const today = new Date().toISOString().split('T')[0];
        const stored = localStorage.getItem('tempmail_rateLimit');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                if (data.date === today) return data;
            } catch (e) { }
        }
        return { date: today, count: 0 };
    }

    function incrementRateLimit() {
        const data = getRateLimitData();
        data.count++;
        localStorage.setItem('tempmail_rateLimit', JSON.stringify(data));
        updateRateLimitBadge();
    }

    function getRemainingGenerates() {
        const data = getRateLimitData();
        return Math.max(0, DAILY_LIMIT - data.count);
    }

    function updateRateLimitBadge() {
        const remaining = getRemainingGenerates();
        rateLimitBadge.textContent = `${remaining}/${DAILY_LIMIT}`;
        if (remaining <= 3) {
            rateLimitBadge.classList.add('rate-critical');
            rateLimitBadge.classList.remove('rate-warning');
        } else if (remaining <= 8) {
            rateLimitBadge.classList.add('rate-warning');
            rateLimitBadge.classList.remove('rate-critical');
        } else {
            rateLimitBadge.classList.remove('rate-warning', 'rate-critical');
        }
    }

    // ===== API Helpers =====
    async function apiCall(endpoint, options = {}) {
        try {
            const res = await fetch(endpoint, options);
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
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            padding: 14px 24px; border-radius: 12px; font-family: 'Inter', sans-serif;
            font-size: 0.85rem; font-weight: 500; z-index: 2000;
            animation: fadeInUp 0.3s ease-out; max-width: 90%; text-align: center;
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
        if (getRemainingGenerates() <= 0) {
            showToast('⚠️ Daily limit reached (20/day). Try again tomorrow!', 'error');
            return;
        }

        const recaptchaToken = window.__recaptchaToken;
        if (recaptchaSiteKey && !recaptchaToken) {
            showToast('⚠️ Please complete the reCAPTCHA first', 'error');
            return;
        }

        btnGenerate.classList.add('loading');
        btnGenerate.disabled = true;

        const data = await apiCall('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recaptchaToken: recaptchaToken || '' })
        });

        btnGenerate.classList.remove('loading');
        btnGenerate.disabled = false;

        if (data.success) {
            currentEmail = data.email;
            currentRouteId = data.routeId;
            currentCreatedAt = data.createdAt;

            incrementRateLimit();
            resetRecaptcha();

            localStorage.setItem('tempmail_current', currentEmail);
            localStorage.setItem('tempmail_routeId', currentRouteId || '');
            localStorage.setItem('tempmail_createdAt', currentCreatedAt || '');

            emailPlaceholder.style.display = 'none';
            emailAddress.style.display = 'flex';
            emailText.textContent = currentEmail;
            generatorCard.classList.add('active');

            inboxSection.style.display = 'block';
            inboxSection.style.animation = 'fadeInUp 0.4s ease-out';
            timerInfo.style.display = 'flex';

            startExpiryTimer();
            startAutoRefresh();
            fetchInbox();

            showToast('✅ Email created! Auto-deletes in 30 minutes', 'success');
        } else {
            showToast(`❌ ${data.details || data.error || 'Failed to generate email'}`, 'error');
            resetRecaptcha();
        }
    }

    function resetRecaptcha() {
        window.__recaptchaToken = null;
        if (window.grecaptcha && recaptchaSiteKey) {
            grecaptcha.reset();
            btnGenerate.disabled = true;
            btnGenerate.classList.remove('ready');
            generateStep.classList.remove('step-active');
        }
    }

    // ===== Reset UI =====
    function resetToInitial() {
        currentEmail = null;
        currentRouteId = null;
        currentCreatedAt = null;

        localStorage.removeItem('tempmail_current');
        localStorage.removeItem('tempmail_routeId');
        localStorage.removeItem('tempmail_createdAt');

        emailPlaceholder.style.display = 'flex';
        emailAddress.style.display = 'none';
        emailText.textContent = '';
        generatorCard.classList.remove('active');

        inboxSection.style.display = 'none';
        emailList.innerHTML = '';
        emailCount.textContent = '0 messages';
        inboxEmpty.style.display = 'block';

        timerInfo.style.display = 'none';
        stopExpiryTimer();
        stopAutoRefresh();
        resetRecaptcha();
    }

    // ===== Copy Email =====
    function copyEmail() {
        if (!currentEmail) return;
        navigator.clipboard.writeText(currentEmail).then(() => {
            copyFeedback.classList.add('show');
            setTimeout(() => copyFeedback.classList.remove('show'), 1500);
        }).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = currentEmail;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
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

    function renderEmailList(emails) {
        emailList.innerHTML = emails.map((email, index) => {
            const senderName = extractSenderName(email.from);
            const initial = senderName.charAt(0).toUpperCase();
            const timeAgo = formatTimeAgo(email.date);
            return `
        <div class="email-item ${!email.isRead ? 'unread' : ''}" data-id="${email.id}" 
             style="animation-delay: ${index * 50}ms" onclick="window.__openEmail('${email.id}')">
          <div class="email-avatar">${initial}</div>
          <div class="email-info">
            <div class="email-info-top">
              <span class="email-sender">${escapeHtml(senderName)}</span>
              <span class="email-time">${timeAgo}</span>
            </div>
            <div class="email-subject">${escapeHtml(email.subject)}</div>
            <div class="email-snippet">${escapeHtml(email.snippet)}</div>
          </div>
        </div>`;
        }).join('');
    }

    // ===== Email Detail =====
    window.__openEmail = async function (emailId) {
        modalOverlay.classList.add('active');
        emailBodyContent.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:40px;color:var(--text-muted)"><div class="loading-spinner"></div><span>Loading...</span></div>`;
        modalAttachments.style.display = 'none';

        const data = await apiCall(`/api/email?id=${emailId}`);
        if (data.success && data.email) {
            const e = data.email;
            modalSubject.textContent = e.subject;
            modalFrom.textContent = `From: ${e.from}`;
            modalDate.textContent = `Date: ${formatDate(e.date)}`;

            if (e.htmlBody) {
                const iframe = document.createElement('iframe');
                iframe.sandbox = 'allow-same-origin';
                iframe.style.cssText = 'width:100%;border:none;border-radius:12px;background:white;min-height:300px;';
                emailBodyContent.innerHTML = '';
                emailBodyContent.appendChild(iframe);
                setTimeout(() => {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    doc.open();
                    doc.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:-apple-system,sans-serif;padding:20px;margin:0;color:#333;font-size:14px;line-height:1.6}img{max-width:100%;height:auto}a{color:#6c5ce7}</style></head><body>${e.htmlBody}</body></html>`);
                    doc.close();
                    new ResizeObserver(() => { iframe.style.height = doc.body.scrollHeight + 40 + 'px'; }).observe(doc.body);
                    iframe.style.height = doc.body.scrollHeight + 40 + 'px';
                }, 50);
            } else if (e.textBody) {
                emailBodyContent.innerHTML = `<pre>${escapeHtml(e.textBody)}</pre>`;
            } else {
                emailBodyContent.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:40px">No content</p>`;
            }

            if (e.attachments && e.attachments.length > 0) {
                modalAttachments.style.display = 'block';
                attachmentList.innerHTML = e.attachments.map(a => `<span class="attachment-item">📄 ${escapeHtml(a.filename)} (${formatBytes(a.size)})</span>`).join('');
            }
        } else {
            emailBodyContent.innerHTML = `<p style="color:var(--danger);text-align:center;padding:40px">Failed to load</p>`;
        }
    };

    function closeModal() { modalOverlay.classList.remove('active'); }

    // ===== Auto Refresh =====
    function startAutoRefresh() {
        stopAutoRefresh();
        countdown = 5;
        updateCountdown();
        countdownInterval = setInterval(() => {
            countdown--;
            updateCountdown();
            if (countdown <= 0) { fetchInbox(); countdown = 5; }
        }, 1000);
    }
    function stopAutoRefresh() { if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; } }
    function updateCountdown() { timerText.textContent = `Auto-refresh in ${countdown}s`; }

    // ===== Expiry Timer =====
    function startExpiryTimer() {
        stopExpiryTimer();
        expiryTimer.style.display = 'block';
        updateExpiryDisplay();
        expiryInterval = setInterval(() => {
            if (getExpiryRemaining() <= 0) { showToast('⏰ Email expired', 'info'); resetToInitial(); return; }
            updateExpiryDisplay();
        }, 1000);
    }
    function stopExpiryTimer() { if (expiryInterval) { clearInterval(expiryInterval); expiryInterval = null; } expiryTimer.style.display = 'none'; }
    function getExpiryRemaining() {
        if (!currentCreatedAt) return 0;
        return Math.max(0, new Date(currentCreatedAt).getTime() + EXPIRY_MINUTES * 60000 - Date.now());
    }
    function updateExpiryDisplay() {
        const ms = getExpiryRemaining(), total = EXPIRY_MINUTES * 60000;
        const sec = Math.ceil(ms / 1000), m = Math.floor(sec / 60), s = sec % 60;
        expiryTimeText.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        const p = (ms / total) * 100;
        expiryProgressFill.style.width = `${p}%`;
        if (p <= 15) { expiryProgressFill.style.background = 'var(--danger)'; expiryTimer.classList.add('expiry-critical'); expiryTimer.classList.remove('expiry-warning'); }
        else if (p <= 40) { expiryProgressFill.style.background = 'var(--warning)'; expiryTimer.classList.add('expiry-warning'); expiryTimer.classList.remove('expiry-critical'); }
        else { expiryProgressFill.style.background = ''; expiryTimer.classList.remove('expiry-warning', 'expiry-critical'); }
    }

    async function manualRefresh() { btnRefresh.classList.add('spinning'); await fetchInbox(); btnRefresh.classList.remove('spinning'); countdown = 5; }

    // ===== Utilities =====
    function extractSenderName(f) { if (!f) return '?'; let m = f.match(/^"?([^"<]+)"?\s*</); if (m) return m[1].trim(); m = f.match(/([^@]+)@/); return m ? m[1] : f; }
    function formatTimeAgo(d) { if (!d) return ''; const ms = Date.now() - new Date(d), m = Math.floor(ms / 60000), h = Math.floor(ms / 3600000), dy = Math.floor(ms / 86400000); if (m < 1) return 'Just now'; if (m < 60) return `${m}m ago`; if (h < 24) return `${h}h ago`; if (dy < 7) return `${dy}d ago`; return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    function formatDate(d) { return d ? new Date(d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; }
    function formatBytes(b) { if (!b) return '0 B'; const s = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(b) / Math.log(1024)); return `${(b / Math.pow(1024, i)).toFixed(1)} ${s[i]}`; }
    function escapeHtml(t) { if (!t) return ''; const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

    // ===== Event Listeners =====
    btnGenerate.addEventListener('click', generateEmail);
    btnCopy.addEventListener('click', copyEmail);
    btnRefresh.addEventListener('click', manualRefresh);
    btnCloseModal.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    // ===== Init =====
    updateRateLimitBadge();
    loadRecaptcha();

    // ===== Restored Session =====
    const savedEmail = localStorage.getItem('tempmail_current');
    const savedRouteId = localStorage.getItem('tempmail_routeId');
    const savedCreatedAt = localStorage.getItem('tempmail_createdAt');

    if (savedEmail) {
        currentEmail = savedEmail;
        currentRouteId = savedRouteId;
        currentCreatedAt = savedCreatedAt;

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
