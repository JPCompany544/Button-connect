"use client";

import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";

function App() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const wcRef = useRef<any | null>(null);
  
  const isMobile = () => /Android|iPhone|iPad|iPod|IEMobile|Mobile/i.test(navigator.userAgent);
  const isTrustInApp = () => {
    const w = window as any;
    if (w?.trustwallet) return true;
    return /Trust\s?Wallet|TrustWallet/i.test(navigator.userAgent);
  };
  useEffect(() => {
    console.log("VITE_WC_PROJECT_ID:", import.meta.env.VITE_WC_PROJECT_ID);
    console.log("VITE_PUBLIC_BASE_URL:", import.meta.env.VITE_PUBLIC_BASE_URL);
  }, []);
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
      // In mobile in-app browser, provider may not flag isTrust — accept ethereum directly
      if (isMobile()) return eth;
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
  
  const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
  };
  
  const promisifySendAsync = (eth: any, payload: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      try { eth.sendAsync(payload, (err: any, res: any) => err ? reject(err) : resolve(res?.result)); }
      catch (e) { reject(e); }
    });
  };
  
  const requestAccountsCompat = async (eth: any): Promise<string[]> => {
    let accounts: any = [];
    if (eth && typeof eth === "object" && typeof eth.selectedAddress === "string" && eth.selectedAddress) return [eth.selectedAddress];
    try { accounts = await withTimeout(eth.request({ method: "eth_requestAccounts" }), 12000); } catch {}
    if (!accounts?.length) { try { accounts = await withTimeout(eth.request({ method: "eth_requestAccounts", params: [] }), 12000); } catch {} }
    if (!accounts?.length && typeof eth.enable === "function") { try { const r = await withTimeout(eth.enable(), 12000); if (Array.isArray(r)) accounts = r; } catch {} }
    if (!accounts?.length && typeof eth.sendAsync === "function") { try { const r = await withTimeout(promisifySendAsync(eth, { method: "eth_requestAccounts", params: [] }), 12000); if (Array.isArray(r)) accounts = r; } catch {} }
    if (!accounts?.length && typeof eth.send === "function") { try { const r: any = await withTimeout(Promise.resolve(eth.send("eth_requestAccounts", [])), 12000); if (Array.isArray(r)) accounts = r; else if (Array.isArray(r?.result)) accounts = r.result; } catch {} }
    if (!accounts?.length) { try { const provider = new ethers.BrowserProvider(eth); const r = await withTimeout(provider.send("eth_requestAccounts", []), 12000); if (Array.isArray(r)) accounts = r; } catch {} }
    if (!accounts?.length && eth && typeof eth.selectedAddress === "string" && eth.selectedAddress) return [eth.selectedAddress];
    if (!accounts?.length) { await new Promise(r => setTimeout(r, 1000)); if (eth && typeof eth.selectedAddress === "string" && eth.selectedAddress) return [eth.selectedAddress]; }
    return accounts as string[];
  };

  useEffect(() => {
    const onAccountsChanged = (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        setWalletAddress(null);
      } else {
        try { setWalletAddress(ethers.getAddress(accounts[0])); } catch { setWalletAddress(accounts[0]); }
      }
    };
    const attach = () => {
      const tw = getTrustWalletProvider();
      const on = (tw as any)?.on ?? (tw as any)?.addListener;
      on?.("accountsChanged", onAccountsChanged);
    };
    attach();
    window.addEventListener("trustwallet#initialize" as any, attach as any, { once: true } as any);
    return () => {
      try {
        const tw = getTrustWalletProvider();
        const off = (tw as any)?.removeListener ?? (tw as any)?.off;
        off?.("accountsChanged", onAccountsChanged);
      } catch {}
      window.removeEventListener("trustwallet#initialize" as any, attach as any);
    };
  }, []);

  const connectWallet = async () => {
    try {
      setConnecting(true);
      let twProvider = getTrustWalletProvider();
      if (isMobile() && !twProvider) {
        twProvider = await waitForTrustWalletProvider(6000);
      }
      const inApp = isMobile() && isTrustInApp();
      if (isMobile() && !inApp && !twProvider) {
        const projectId = (import.meta as any)?.env?.VITE_WC_PROJECT_ID as string | undefined;
        if (!projectId) {
          alert("Missing WalletConnect project id");
          return;
        }
        const { default: EthereumProvider } = await import("@walletconnect/ethereum-provider");
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
        if (inApp && (window as any).ethereum) twProvider = (window as any).ethereum;
        if (!twProvider) { alert("Trust Wallet not found"); return; }
      }
      
      let addr: string | undefined;
      if (isMobile()) {
        const accounts = await requestAccountsCompat(twProvider);
        if (!accounts?.length) throw new Error("No accounts");
        addr = accounts[0];
      } else {
        // Desktop extension: keep best-effort re-prompt behavior
        const accounts = await requestFreshAccountsPermission(twProvider);
        addr = accounts?.[0];
      }
      const provider = new ethers.BrowserProvider(twProvider);
      const signer = await provider.getSigner();
      const finalAddr = ethers.getAddress(addr ?? (await signer.getAddress()));
      setWalletAddress(finalAddr);
      
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
