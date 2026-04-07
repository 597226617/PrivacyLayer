# PrivacyLayer React Integration Example

This example demonstrates how to integrate PrivacyLayer with React applications using hooks and context provider pattern.

## Installation

```bash
npm install @privacylayer/sdk
```

## Quick Start

### 1. Setup PrivacyLayer Provider

```jsx
// App.jsx
import { PrivacyLayerProvider } from '@privacylayer/sdk/react';

function App() {
  return (
    <PrivacyLayerProvider
      config={{
        network: 'testnet',
        rpcUrl: 'https://testnet.privacylayer.io'
      }}
    >
      <YourApp />
    </PrivacyLayerProvider>
  );
}
```

### 2. Use the Hook

```jsx
// components/PrivateTransfer.jsx
import { usePrivacyPool } from '@privacylayer/sdk/react';

function PrivateTransfer() {
  const { deposit, withdraw, balance, isReady } = usePrivacyPool();

  const handleDeposit = async (amount) => {
    await deposit(amount);
  };

  const handleWithdraw = async (amount, recipient) => {
    await withdraw(amount, recipient);
  };

  if (!isReady) return <div>Connecting...</div>;

  return (
    <div>
      <p>Balance: {balance} USDC</p>
      <button onClick={() => handleDeposit(100)}>Deposit 100 USDC</button>
      <button onClick={() => handleWithdraw(50, 'recipient-address')}>
        Withdraw 50 USDC
      </button>
    </div>
  );
}
```

## Full Example Component

```jsx
import React, { useState } from 'react';
import { usePrivacyPool } from '@privacylayer/sdk/react';

export default function PrivacyDashboard() {
  const { deposit, withdraw, balance, notes, isProcessing, error } = usePrivacyPool();
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');

  const onDeposit = async (e) => {
    e.preventDefault();
    try {
      await deposit(parseFloat(amount));
      setAmount('');
    } catch (err) {
      console.error('Deposit failed:', err);
    }
  };

  const onWithdraw = async (e) => {
    e.preventDefault();
    try {
      await withdraw(parseFloat(amount), recipient);
      setAmount('');
      setRecipient('');
    } catch (err) {
      console.error('Withdraw failed:', err);
    }
  };

  return (
    <div className="privacy-dashboard">
      <h2>PrivacyLayer Dashboard</h2>
      
      {error && <div className="error">{error.message}</div>}
      
      <div className="balance">
        <h3>Private Balance</h3>
        <p>{balance} USDC</p>
      </div>

      <form onSubmit={onDeposit}>
        <h3>Deposit</h3>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          disabled={isProcessing}
        />
        <button type="submit" disabled={isProcessing || !amount}>
          {isProcessing ? 'Processing...' : 'Deposit'}
        </button>
      </form>

      <form onSubmit={onWithdraw}>
        <h3>Withdraw</h3>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          disabled={isProcessing}
        />
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="Recipient Address"
          disabled={isProcessing}
        />
        <button type="submit" disabled={isProcessing || !amount || !recipient}>
          {isProcessing ? 'Processing...' : 'Withdraw'}
        </button>
      </form>

      <div className="notes">
        <h3>Unspent Notes: {notes.length}</h3>
        <ul>
          {notes.map((note, i) => (
            <li key={i}>{note.amount} USDC</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

## API Reference

### usePrivacyPool()

Returns an object with:

| Property | Type | Description |
|----------|------|-------------|
| `balance` | number | Current private balance |
| `notes` | Array | Unspent notes |
| `deposit` | function | Deposit public tokens to private pool |
| `withdraw` | function | Withdraw from private pool to recipient |
| `isProcessing` | boolean | Whether a transaction is in progress |
| `error` | Error | Last error if any |
| `isReady` | boolean | Whether the hook is initialized |

## License

MIT
