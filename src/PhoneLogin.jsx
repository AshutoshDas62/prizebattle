import React, { useState } from 'react';
import { sendPhoneCode } from './firebase';

export default function PhoneLogin({ onLogin }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setBusy(true);
    try {
      setConfirmation(await sendPhoneCode(phone));
    } catch (error) {
      onLogin(error.message);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    setBusy(true);
    try {
      const result = await confirmation.confirm(code);
      const token = await result.user.getIdToken();
      const response = await fetch('/api/auth/firebase', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        onLogin(data.message || 'Phone login failed');
        return;
      }
      onLogin(`Welcome back, ${data.user.name}!`);
      window.location.reload();
    } catch {
      onLogin('Invalid OTP or phone login failed.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="empty phone-login"><h3>Login with phone OTP</h3><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number with country code" /><div id="recaptcha-container"></div>{confirmation ? <><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="6-digit OTP" /><button type="button" className="primary" onClick={verifyCode} disabled={busy}>Verify OTP</button></> : <button type="button" className="secondary" onClick={sendCode} disabled={busy}>Send OTP</button>}</section>;
}
