"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";

function App() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  
  const isMobile = () => /Android|iPhone|iPad|iPod|IEMobile|Mobile/i.test(navigator.userAgent);
  
  const getTrustWalletProvider = (): any | null => {
    const win = window as any;
    const eth = win?.ethereum;
    const isTrust = (p: any) => !!p?.isTrust;
    if (eth) {
      if (isTrust(eth)) return eth;
      if (Array.isArray(eth.providers)) {
        const tw = eth.providers.find(isTrust);
        if (tw) return tw;
      }
    }
    if (win?.trustwallet) return win.trustwallet;
    return null;
  };
  
  const requestFreshAccountsPermission = async (tw: any): Promise<string[]> => {
    try {
      await tw.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
    } catch {}
    try {
      await tw.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
    } catch {}
    const accounts = await tw.request({ method: "eth_requestAccounts" });
    return accounts as string[];
  };

  useEffect(() => {
    const handler = () => {
      
    };
    window.addEventListener("trustwallet#initialize" as any, handler as any, { once: true } as any);
    const tw = getTrustWalletProvider();
    const on = (tw as any)?.on ?? (tw as any)?.addListener;
    const off = (tw as any)?.removeListener ?? (tw as any)?.off;
    const onAccountsChanged = (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        setWalletAddress(null);
      } else {
        try { setWalletAddress(ethers.getAddress(accounts[0])); } catch { setWalletAddress(accounts[0]); }
      }
    };
    on?.("accountsChanged", onAccountsChanged);
    return () => {
      window.removeEventListener("trustwallet#initialize" as any, handler as any);
      off?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  const connectWallet = async () => {
    try {
      setConnecting(true);
      
      if (isMobile()) {
        const deeplink = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(window.location.href)}`;
        window.location.href = deeplink;
        return;
      }
      
      const twProvider = getTrustWalletProvider();
      if (!twProvider) {
        alert("Trust Wallet not found");
        return;
      }
      
      const accounts = await requestFreshAccountsPermission(twProvider);
      const provider = new ethers.BrowserProvider(twProvider);
      const signer = await provider.getSigner();
      const addr = accounts?.[0] ?? (await signer.getAddress());
      setWalletAddress(ethers.getAddress(addr));
      
      try { localStorage.clear(); } catch {}
    } catch (err) {
      console.error(err);
    } finally {
      setConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setWalletAddress(null);
    try { localStorage.clear(); } catch {}
  };

  const shortAddr = (addr: string) => addr.slice(0, 6) + "..." + addr.slice(-4);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0f0f0f] text-white">
      {!walletAddress ? (
        <button
          onClick={connectWallet}
          disabled={connecting}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors duration-200"
        >
          {connecting ? "Connecting..." : "Connect Wallet"}
        </button>
      ) : (
        <div className="flex flex-col items-center space-y-4">
          <span className="text-sm text-gray-400">Connected: {shortAddr(walletAddress)}</span>
          <button
            onClick={disconnectWallet}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors duration-200"
          >
            Disconnect Wallet
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
