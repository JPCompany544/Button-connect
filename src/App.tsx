"use client";

import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import EthereumProvider from "@walletconnect/ethereum-provider";

function App() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const wcRef = useRef<any | null>(null);
  
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
  
  const waitForTrustWalletProvider = (timeoutMs = 3000): Promise<any | null> => {
    return new Promise((resolve) => {
      const existing = getTrustWalletProvider();
      if (existing) return resolve(existing);
      let done = false;
      const onInit = () => {
        if (done) return;
        done = true;
        resolve(getTrustWalletProvider());
      };
      window.addEventListener("trustwallet#initialize" as any, onInit as any, { once: true } as any);
      const tid = setTimeout(() => {
        if (done) return;
        done = true;
        resolve(getTrustWalletProvider());
      }, timeoutMs);
      // Safety: also poll once in case event doesn't fire
      setTimeout(() => {
        if (done) return;
        const p = getTrustWalletProvider();
        if (p) {
          done = true;
          clearTimeout(tid);
          resolve(p);
        }
      }, 300);
    });
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
      let twProvider = getTrustWalletProvider();
      if (isMobile() && !twProvider) {
        twProvider = await waitForTrustWalletProvider(1500);
      }
      if (isMobile() && !twProvider) {
        const projectId = (import.meta as any)?.env?.VITE_WC_PROJECT_ID as string | undefined;
        if (!projectId) {
          alert("Missing WalletConnect project id");
          return;
        }
        const wc = await EthereumProvider.init({
          projectId,
          showQrModal: false,
          chains: [1],
          methods: [
            "eth_sendTransaction",
            "eth_signTransaction",
            "eth_sign",
            "personal_sign",
            "eth_signTypedData",
            "eth_signTypedData_v4"
          ],
          events: ["chainChanged", "accountsChanged"],
        });
        wcRef.current = wc;
        wc.on("display_uri", (uri: string) => {
          const dl = `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`;
          window.location.href = dl;
        });
        await wc.connect();
        const provider = new ethers.BrowserProvider(wc);
        const signer = await provider.getSigner();
        const addr = await signer.getAddress();
        setWalletAddress(ethers.getAddress(addr));
        try { localStorage.clear(); } catch {}
        wc.on?.("accountsChanged", (accounts: string[]) => {
          if (!accounts || accounts.length === 0) {
            setWalletAddress(null);
          } else {
            try { setWalletAddress(ethers.getAddress(accounts[0])); } catch { setWalletAddress(accounts[0]); }
          }
        });
        return;
      }
      
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
    try { wcRef.current?.disconnect?.(); } catch {}
    wcRef.current = null;
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
