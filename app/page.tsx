import CidadeDorme from "@/components/cidade-dorme"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white p-4">
      <div className="container mx-auto max-w-4xl">
        <h1 className="text-4xl font-bold text-center my-8 text-amber-400">Cidade Dorme</h1>
        <p className="text-center mb-8">Versão para jogar via Radmin VPN</p>
        <CidadeDorme />
      </div>
    </main>
  )
}

