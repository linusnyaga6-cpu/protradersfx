document.addEventListener('DOMContentLoaded', () => {
  const track = async (type, extra = {}) => {
    try {
      await fetch('/api/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type,
          path: window.location.pathname,
          ...extra
        }),
        keepalive: true
      });
    } catch (error) {
      console.warn('Tracking unavailable');
    }
  };

  // Track a page visit
  track('page_view');

  // Track important buttons
  document.querySelectorAll('a[href="/api/deriv/signup"]').forEach(link => {
    link.addEventListener('click', () => {
      track('signup_click');
    });
  });

  document.querySelectorAll('a[href="/api/deriv/login"]').forEach(link => {
    link.addEventListener('click', () => {
      track('login_click');
    });
  });

  // Show OAuth result messages
  const params = new URLSearchParams(window.location.search);

  if (params.get('registered') === '1') {
    showNotice(
      'Account registration completed successfully. Welcome to ProTraders FX.'
    );
  }

  if (params.get('logged_in') === '1') {
    showNotice(
      'Deriv login completed successfully.'
    );
  }

  if (params.get('oauth_error')) {
    showNotice(
      'We could not complete the Deriv authentication. Please try again.',
      true
    );
  }

  // Remove temporary OAuth query parameters from the address bar
  if (
    params.has('registered') ||
    params.has('logged_in') ||
    params.has('oauth_error')
  ) {
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.hash
    );
  }
});

function showNotice(message, error = false) {
  const existing = document.getElementById('protraders-notice');

  if (existing) {
    existing.remove();
  }

  const notice = document.createElement('div');

  notice.id = 'protraders-notice';
  notice.textContent = message;

  notice.style.position = 'fixed';
  notice.style.top = '24px';
  notice.style.right = '24px';
  notice.style.zIndex = '9999';
  notice.style.maxWidth = '420px';
  notice.style.padding = '16px 20px';
  notice.style.borderRadius = '12px';
  notice.style.background = error ? '#3b1720' : '#102a20';
  notice.style.color = '#ffffff';
  notice.style.border = error
    ? '1px solid #8f3548'
    : '1px solid #2e8061';
  notice.style.fontFamily =
    'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  notice.style.fontSize = '14px';
  notice.style.fontWeight = '600';
  notice.style.boxShadow = '0 15px 40px rgba(0,0,0,.35)';

  document.body.appendChild(notice);

  setTimeout(() => {
    notice.style.opacity = '0';
    notice.style.transition = 'opacity .4s ease';

    setTimeout(() => {
      notice.remove();
    }, 400);
  }, 5000);
}
