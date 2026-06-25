import { useState } from 'react';
import { Card, Button } from '../../lib/ui.jsx';
import { useAuth } from '../../hooks/useAuth.js';

export default function AuthScreen() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
        setNotice('Check your email to confirm your account.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-[430px] mx-auto bg-[#f5f5f2] min-h-screen flex flex-col items-center justify-center px-6">
      <h1 className="text-xl font-semibold mb-1">Cholesterol Tracker</h1>
      <p className="text-sm text-gray-500 mb-6">Track what you eat, protect your heart</p>

      <Card className="w-full">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-black/15 text-sm bg-white"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-3 py-2.5 rounded-lg border border-black/15 text-sm bg-white"
          />
          {error && <p className="text-xs text-[#791F1F]">{error}</p>}
          {notice && <p className="text-xs text-[#085041]">{notice}</p>}
          <Button type="submit" variant="primary" full disabled={loading}>
            {loading ? 'Please wait...' : mode === 'signin' ? 'Log in' : 'Sign up'}
          </Button>
        </form>

        <div className="flex items-center gap-2 my-4 text-xs text-gray-400">
          <div className="flex-1 h-px bg-black/10" />
          or
          <div className="flex-1 h-px bg-black/10" />
        </div>

        <Button onClick={signInWithGoogle} full>
          Continue with Google
        </Button>

        <p className="text-center text-xs text-gray-500 mt-4">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            className="text-emerald-700 font-medium cursor-pointer"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin' ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </Card>
    </div>
  );
}
