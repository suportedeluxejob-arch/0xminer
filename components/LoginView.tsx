import React from "react"
import { signInWithPopup } from "firebase/auth"
import { auth, googleProvider } from "../lib/firebase"

export const LoginView: React.FC = () => {
    const handleLogin = async () => {
        try {
            await signInWithPopup(auth, googleProvider)
        } catch (error) {
            console.error("Login failed:", error)
            alert("Falha no login. Tente novamente.")
        }
    }

    return (
        <div className="h-screen w-full bg-[#050508] flex items-center justify-center relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-900/10 via-transparent to-purple-900/10 pointer-events-none"></div>
            <div className="absolute -top-20 -left-20 w-96 h-96 bg-blue-500/20 rounded-full blur-[100px] animate-pulse-slow"></div>
            <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-[100px] animate-pulse-slow delay-1000"></div>

            {/* Login Card */}
            <div className="bg-[#111] border border-[#333] p-10 rounded-2xl shadow-2xl relative z-10 max-w-md w-full flex flex-col items-center text-center animate-fade-in backdrop-blur-md bg-opacity-80">

                {/* Logo */}
                <div className="mb-8 relative group">
                    <div className="absolute inset-0 bg-accent blur-xl opacity-20 group-hover:opacity-40 transition-opacity duration-500 rounded-full"></div>
                    <img
                        src="/logo-0xminer-v2.jpg"
                        alt="0xMINER"
                        className="w-24 h-24 object-contain relative z-10 rounded-full drop-shadow-[0_0_15px_rgba(0,230,118,0.3)]"
                    />
                </div>

                <h1 className="text-4xl font-bold text-white mb-2 font-mono tracking-tighter">
                    0x<span className="text-accent">MINER</span>
                </h1>
                <p className="text-[#888] mb-10 text-sm font-mono uppercase tracking-widest">
                    Web3 Mining Simulator
                </p>

                {/* Login Button */}
                <button
                    onClick={handleLogin}
                    className="w-full bg-white text-black font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:bg-gray-100 hover:scale-[1.02] transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] group"
                >
                    <img
                        src="https://www.svgrepo.com/show/475656/google-color.svg"
                        alt="Google"
                        className="w-6 h-6"
                    />
                    <span className="uppercase tracking-wider text-sm">Entrar com Google</span>
                </button>

                <div className="mt-8 text-[10px] text-[#444] font-mono">
                    SECURE CONNECTION // FIREBASE AUTH // v9.3.0
                </div>
            </div>
        </div>
    )
}
