import { useEffect } from 'react';

const AuthCallback = () => {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    const state = urlParams.get('state');

    if (error) {
      // Send error back to parent window
      window.opener?.postMessage({
        type: 'GOOGLE_AUTH_ERROR',
        error: error
      }, window.location.origin);
      window.close();
      return;
    }

    if (code && state) {
      // Send success back to parent window
      window.opener?.postMessage({
        type: 'GOOGLE_AUTH_SUCCESS',
        code: code,
        state: state
      }, window.location.origin);
      window.close();
      return;
    }

    // No code or error found, something went wrong
    window.opener?.postMessage({
      type: 'GOOGLE_AUTH_ERROR',
      error: 'No authorization code received'
    }, window.location.origin);
    window.close();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Processing authorization...</p>
      </div>
    </div>
  );
};

export default AuthCallback;