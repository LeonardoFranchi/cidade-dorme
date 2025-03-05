"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Moon, Sun, UserCheck, Shield, Users, Skull, Award, Copy, ThumbsUp, AlertTriangle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { io } from "socket.io-client"
import { useToast } from "@/components/ui/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Tipos de papéis no jogo
type Role = "assassino" | "detetive" | "anjo" | "cidadao" | null

// Interface para representar um jogador
interface Player {
  id: string
  name: string
  role: Role
  alive?: boolean
  isHost?: boolean
}

// Interface para representar o estado do jogo
interface GameState {
  phase: "lobby" | "night" | "day" | "end"
  round: number
  nightActions?: {
    assassinTarget: string | null
    detectiveTarget: string | null
    angelTarget: string | null
  }
  dayVotes?: Record<string, string>
  winner: "assassinos" | "cidadaos" | null
  message?: string
  nightMessage?: string[]
  dayMessage?: string[]
}

export default function CidadeDorme() {
  const [socket, setSocket] = useState<any>(null)
  const [username, setUsername] = useState<string>("")
  const [roomId, setRoomId] = useState<string>("")
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [isHost, setIsHost] = useState<boolean>(false)
  const [players, setPlayers] = useState<Player[]>([])
  const [gameState, setGameState] = useState<GameState>({
    phase: "lobby",
    round: 0,
    winner: null,
  })
  const [myRole, setMyRole] = useState<Role>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [investigationResult, setInvestigationResult] = useState<{ targetName: string; isAssassin: boolean } | null>(
    null,
  )
  const [showGameRules, setShowGameRules] = useState<boolean>(false)
  const [serverAddress, setServerAddress] = useState<string>("https://cidade-dorme-server.onrender.com/")
  const [isServerConnected, setIsServerConnected] = useState<boolean>(false)
  const [voteCount, setVoteCount] = useState<Record<string, number>>({})
  const [myVote, setMyVote] = useState<string | null>(null)
  const [myAction, setMyAction] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [showRoles, setShowRoles] = useState<boolean>(false)
  const { toast } = useToast()

  // Limpar mensagens de erro após um tempo
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage("")
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [errorMessage])

  // Conectar ao servidor
  const connectToServer = () => {
    try {
      const newSocket = io(serverAddress)

      newSocket.on("connect", () => {
        setSocket(newSocket)
        setIsServerConnected(true)
        toast({
          title: "Conectado ao servidor",
          description: "Você está conectado ao servidor do jogo.",
        })
      })

      newSocket.on("connect_error", (err: any) => {
        console.error("Erro de conexão:", err)
        setErrorMessage("Não foi possível conectar ao servidor. Verifique o endereço e tente novamente.")
        toast({
          variant: "destructive",
          title: "Erro de conexão",
          description: "Não foi possível conectar ao servidor. Verifique o endereço e tente novamente.",
        })
        setIsServerConnected(false)
      })

      // Configurar listeners para eventos do servidor
      setupSocketListeners(newSocket)
    } catch (error) {
      console.error("Erro ao conectar:", error)
      setErrorMessage("Não foi possível conectar ao servidor. Verifique o endereço e tente novamente.")
      toast({
        variant: "destructive",
        title: "Erro de conexão",
        description: "Não foi possível conectar ao servidor. Verifique o endereço e tente novamente.",
      })
    }
  }

  // Configurar listeners para eventos do servidor
  const setupSocketListeners = (socket: any) => {
    socket.on("connect", () => {
      console.log("Conectado ao servidor!")
    })

    socket.on("error", (data: any) => {
      console.error("Erro:", data.message)
      setErrorMessage(data.message)
      toast({
        variant: "destructive",
        title: "Erro",
        description: data.message,
      })
    })

    socket.on("room_created", (data: any) => {
      console.log("Sala criada:", data)
      setRoomId(data.roomId)
      setIsConnected(true)
      setIsHost(data.isHost)
      toast({
        title: "Sala criada",
        description: `Sala criada com sucesso! ID: ${data.roomId}`,
      })
    })

    socket.on("room_joined", (data: any) => {
      console.log("Sala encontrada:", data)
      setRoomId(data.roomId)
      setIsConnected(true)
      setIsHost(data.isHost)
      toast({
        title: "Sala encontrada",
        description: `Você entrou na sala ${data.roomId}`,
      })
    })

    socket.on("update_players", (data: Player[]) => {
      console.log("Lista de jogadores atualizada:", data)
      setPlayers(data)
    })

    socket.on("host_changed", (data: any) => {
      console.log("Host alterado:", data)
      if (socket.id === data.newHost) {
        setIsHost(true)
        toast({
          title: "Você é o novo host",
          description: "O host anterior saiu e você agora é o host da sala.",
        })
      }
    })

    socket.on("game_started", (data: any) => {
      console.log("Jogo iniciado:", data)
      setMyRole(data.role)
      setPlayers(data.players)
      setGameState(data.gameState)
      setShowRoles(false)
      toast({
        title: "O jogo começou!",
        description: `Seu papel é: ${translateRole(data.role)}`,
      })
    })

    socket.on("investigation_result", (data: any) => {
      console.log("Resultado da investigação:", data)
      setInvestigationResult(data)
      toast({
        title: "Resultado da investigação",
        description: data.isAssassin ? `${data.targetName} é um Assassino!` : `${data.targetName} não é um Assassino.`,
      })
    })

    socket.on("action_registered", (data: any) => {
      console.log("Ação registrada:", data)
      setMyAction(data.action)
      toast({
        title: "Ação registrada",
        description: "Sua ação foi registrada com sucesso.",
      })
    })

    socket.on("vote_registered", (data: any) => {
      console.log("Voto registrado:", data)
      setMyVote(data.targetId)
      const targetName = players.find((p) => p.id === data.targetId)?.name || "Jogador"
      toast({
        title: "Voto registrado",
        description: `Você votou em ${targetName}.`,
      })
    })

    socket.on("vote_update", (data: any) => {
      console.log("Atualização de votos:", data)
      setVoteCount(data.voteCount)
    })

    socket.on("night_processed", (data: any) => {
      console.log("Noite processada:", data)
      setPlayers(data.players)
      setGameState(data.gameState)
      setMyAction(null)
      setInvestigationResult(null)

      if (data.gameState.nightMessage && data.gameState.nightMessage.length > 0) {
        data.gameState.nightMessage.forEach((message: string) => {
          toast({
            title: "Acontecimentos da noite",
            description: message,
          })
        })
      }
    })

    socket.on("day_processed", (data: any) => {
      console.log("Dia processado:", data)
      setPlayers(data.players)
      setGameState(data.gameState)
      setMyVote(null)
      setVoteCount({})

      if (data.gameState.dayMessage && data.gameState.dayMessage.length > 0) {
        data.gameState.dayMessage.forEach((message: string) => {
          toast({
            title: "Resultado da votação",
            description: message,
          })
        })
      }
    })

    socket.on("game_ended", (data: any) => {
      console.log("Jogo terminado:", data)
      // No final do jogo, mostrar todos os papéis
      setShowRoles(true)
      setPlayers(data.players) // Garantir que todos os papéis estejam disponíveis
      toast({
        title: "Fim de jogo",
        description: data.message,
      })
    })

    socket.on("game_restarted", (data: any) => {
      console.log("Jogo reiniciado:", data)
      setPlayers(data.players)
      setGameState(data.gameState)
      setMyRole(null)
      setSelectedPlayer(null)
      setInvestigationResult(null)
      setMyAction(null)
      setMyVote(null)
      setVoteCount({})
      setShowRoles(false)

      toast({
        title: "Jogo reiniciado",
        description: "O jogo foi reiniciado. Aguardando o host iniciar uma nova partida.",
      })
    })

    socket.on("disconnect", () => {
      console.log("Desconectado do servidor")
      setIsServerConnected(false)
      toast({
        variant: "destructive",
        title: "Desconectado",
        description: "Você foi desconectado do servidor.",
      })
    })
  }

  // Criar uma sala
  const createRoom = () => {
    if (!username.trim()) {
      setErrorMessage("Por favor, insira um nome de usuário.")
      toast({
        variant: "destructive",
        title: "Nome inválido",
        description: "Por favor, insira um nome de usuário.",
      })
      return
    }

    if (socket) {
      socket.emit("create_room", username)
    }
  }

  // Entrar em uma sala
  const joinRoom = () => {
    if (!username.trim()) {
      setErrorMessage("Por favor, insira um nome de usuário.")
      toast({
        variant: "destructive",
        title: "Nome inválido",
        description: "Por favor, insira um nome de usuário.",
      })
      return
    }

    if (!roomId.trim()) {
      setErrorMessage("Por favor, insira um ID de sala válido.")
      toast({
        variant: "destructive",
        title: "ID da sala inválido",
        description: "Por favor, insira um ID de sala válido.",
      })
      return
    }

    if (socket) {
      socket.emit("join_room", { roomId, username })
    }
  }

  // Iniciar o jogo
  const startGame = () => {
    if (socket && isHost) {
      socket.emit("start_game", roomId)
    }
  }

  // Realizar ação noturna
  const performNightAction = (targetId: string) => {
    if (!socket || gameState.phase !== "night") return

    let action = ""

    if (myRole === "assassino") {
      action = "kill"
    } else if (myRole === "detetive") {
      action = "investigate"
    } else if (myRole === "anjo") {
      action = "protect"
    } else {
      return
    }

    console.log(`Enviando ação ${action} para o jogador ${targetId}`)

    // Definir o estado local temporariamente para feedback visual imediato
    setMyAction(action)

    socket.emit("night_action", { roomId, targetId, action })
  }

  // Votar durante o dia
  const votePlayer = (targetId: string) => {
    if (!socket || gameState.phase !== "day") return

    // Verificar se o alvo ainda está vivo
    const target = players.find((p) => p.id === targetId)
    if (!target || !target.alive) {
      toast({
        variant: "destructive",
        title: "Erro ao votar",
        description: "Este jogador não está mais disponível para votação.",
      })
      return
    }

    console.log(`Votando no jogador ${targetId}`)

    // Definir o voto localmente para feedback visual imediato
    setMyVote(targetId)

    socket.emit("day_vote", { roomId, targetId })
  }

  // Reiniciar o jogo
  const restartGame = () => {
    if (socket && isHost) {
      socket.emit("restart_game", roomId)
    }
  }

  // Copiar ID da sala para a área de transferência
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId)
    toast({
      title: "ID copiado",
      description: "ID da sala copiado para a área de transferência.",
    })
  }

  // Traduzir o papel para português
  const translateRole = (role: Role): string => {
    switch (role) {
      case "assassino":
        return "Assassino"
      case "detetive":
        return "Detetive"
      case "anjo":
        return "Anjo"
      case "cidadao":
        return "Cidadão"
      default:
        return "Desconhecido"
    }
  }

  // Obter a cor do papel para estilização
  const getRoleColor = (role: Role): string => {
    switch (role) {
      case "assassino":
        return "text-red-500"
      case "detetive":
        return "text-blue-500"
      case "anjo":
        return "text-yellow-500"
      case "cidadao":
        return "text-green-500"
      default:
        return "text-gray-500"
    }
  }

  // Obter o ícone do papel
  const getRoleIcon = (role: Role) => {
    switch (role) {
      case "assassino":
        return <Skull className="h-4 w-4 text-red-500" />
      case "detetive":
        return <UserCheck className="h-4 w-4 text-blue-500" />
      case "anjo":
        return <Shield className="h-4 w-4 text-yellow-500" />
      case "cidadao":
        return <Users className="h-4 w-4 text-green-500" />
      default:
        return null
    }
  }

  // Renderizar a tela de conexão
  const renderConnection = () => (
    <Card className="w-full border-slate-700 shadow-lg">
      <CardHeader className="bg-slate-800 rounded-t-lg">
        <CardTitle className="text-white">Conectar ao Servidor</CardTitle>
        <CardDescription className="text-slate-300">Conecte-se ao servidor do jogo para começar.</CardDescription>
      </CardHeader>
      <CardContent className="p-6 bg-slate-900">
        <div className="space-y-4">
          <div>
            <Label htmlFor="server-address" className="text-white">
              Endereço do Servidor
            </Label>
            <Input
              id="server-address"
              value={serverAddress}
              disabled
              onChange={(e) => setServerAddress(e.target.value)}
              placeholder="https://cidade-dorme-server.onrender.com/"
              className="bg-slate-800 text-white border-slate-700"
            />
          </div>

          {errorMessage && (
            <Alert variant="destructive" className="bg-red-900/40 border-red-900 text-white mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
      <CardFooter className="bg-slate-900 rounded-b-lg border-t border-slate-700 p-6">
        <Button
          onClick={connectToServer}
          disabled={isServerConnected}
          className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold transition-all"
        >
          {isServerConnected ? "Conectado" : "Conectar"}
        </Button>
      </CardFooter>
    </Card>
  )

  // Renderizar a tela de lobby
  const renderLobby = () => (
    <Card className="w-full border-slate-700 shadow-lg overflow-hidden">
      <CardHeader className="bg-slate-800 rounded-t-lg">
        <CardTitle className="text-white">Cidade Dorme - Lobby</CardTitle>
        <CardDescription className="text-slate-300">
          {isConnected
            ? `Sala: ${roomId} - ${players.length} jogador(es) conectado(s)`
            : "Crie ou entre em uma sala para jogar"}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 bg-slate-900">
        <div className="space-y-6">
          {!isConnected ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="username" className="text-white">
                  Seu Nome
                </Label>
                <Input
                  maxLength={42}
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Digite seu nome"
                  className="bg-slate-800 text-white border-slate-700"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div>
                  <Button
                    onClick={createRoom}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold transition-all"
                  >
                    Criar Sala
                  </Button>
                </div>

                <div className="space-y-2">
                  <Input
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    placeholder="ID da Sala"
                    className="bg-slate-800 text-white border-slate-700"
                  />
                  <Button
                    onClick={joinRoom}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all"
                  >
                    Entrar na Sala
                  </Button>
                </div>
              </div>

              {errorMessage && (
                <Alert variant="destructive" className="bg-red-900/40 border-red-900 text-white mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Erro</AlertTitle>
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-800 rounded-lg border border-slate-700">
                <div>
                  <h3 className="text-lg font-semibold text-white">Sala: {roomId}</h3>
                  <p className="text-sm text-slate-400">
                    Compartilhe este ID com seus amigos para que eles possam entrar
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={copyRoomId}
                  className="border-slate-600 hover:bg-slate-700 text-orange-500 hover:text-orange-400"
                >
                  <Copy className="h-4 w-4 mr-2" /> Copiar ID
                </Button>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Jogadores ({players.length}/12)</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {players.map((player, index) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg bg-slate-800 border border-slate-700 transition-all hover:bg-slate-750"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-white">{player.name}</span>
                        {player.isHost && (
                          <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/50">
                            Host
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {isHost && (
                <div className="pt-4">
                  <Button
                    onClick={startGame}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold transition-all"
                    disabled={players.length < 7 || players.length > 12}
                  >
                    Iniciar Jogo
                  </Button>
                  {players.length < 7 && (
                    <p className="text-sm text-red-400 mt-2 text-center">
                      São necessários pelo menos 7 jogadores para iniciar.
                    </p>
                  )}
                  {players.length > 12 && (
                    <p className="text-sm text-red-400 mt-2 text-center">O jogo suporta no máximo 12 jogadores.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="bg-slate-900 border-t border-slate-700 p-6">
        <Button
          variant="outline"
          onClick={() => setShowGameRules(true)}
          className="w-full text-orange-500 border-slate-600 hover:bg-slate-700 hover:text-orange-400"
        >
          Regras do Jogo
        </Button>
      </CardFooter>
    </Card>
  )

  // Renderizar a fase noturna
  const renderNight = () => {
    const me = players.find((p) => p.id === socket?.id)
    const aliveOthers = players.filter((p) => p.alive && p.id !== socket?.id)

    return (
      <Card className="w-full bg-slate-900 border-indigo-900 shadow-lg overflow-hidden transition-all duration-500">
        <CardHeader className="bg-indigo-900 bg-opacity-30">
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2 text-white">
              <Moon className="text-indigo-400" /> Noite na Cidade - Rodada {gameState.round}
            </CardTitle>
            <Badge variant="outline" className="bg-indigo-900/30 text-indigo-300 border-indigo-700">
              {getRoleIcon(myRole)} Seu papel: {translateRole(myRole)}
            </Badge>
          </div>
          <CardDescription className="text-indigo-200">
            A cidade dorme e os personagens especiais realizam suas ações.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6">
            {myRole === "assassino" && (
              <div className="p-5 bg-red-900/20 rounded-lg border border-red-900/30 shadow-inner transition-all">
                <h3 className="flex items-center gap-2 text-lg font-semibold mb-3 text-red-300">
                  <Skull className="text-red-400" /> Você é um Assassino
                </h3>
                <p className="text-sm mb-4 text-red-200">Escolha um jogador para eliminar esta noite.</p>

                {myAction ? (
                  <Alert className="bg-green-900/20 border-green-800 text-green-200">
                    <ThumbsUp className="h-4 w-4 text-green-400" />
                    <AlertTitle>Ação realizada</AlertTitle>
                    <AlertDescription>Você já escolheu seu alvo. Aguardando outros jogadores...</AlertDescription>
                  </Alert>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {aliveOthers.map((player, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        className={`h-auto py-2 text-white ${
                          player.role === "assassino"
                            ? "bg-red-900/30 border-red-700 cursor-not-allowed"
                            : "bg-slate-800 border-slate-700 hover:bg-red-900/30 hover:border-red-700"
                        }`}
                        onClick={() => performNightAction(player.id)}
                        disabled={player.role === "assassino"}
                      >
                        {player.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {myRole === "detetive" && (
              <div className="p-5 bg-blue-900/20 rounded-lg border border-blue-900/30 shadow-inner transition-all">
                <h3 className="flex items-center gap-2 text-lg font-semibold mb-3 text-blue-300">
                  <UserCheck className="text-blue-400" /> Você é um Detetive
                </h3>
                <p className="text-sm mb-4 text-blue-200">Escolha um jogador para investigar esta noite.</p>

                {investigationResult ? (
                  <Alert
                    className={
                      investigationResult.isAssassin
                        ? "bg-red-900/20 border-red-800 text-red-200"
                        : "bg-green-900/20 border-green-800 text-green-200"
                    }
                  >
                    {investigationResult.isAssassin ? (
                      <Skull className="h-4 w-4 text-red-400" />
                    ) : (
                      <ThumbsUp className="h-4 w-4 text-green-400" />
                    )}
                    <AlertTitle>Resultado da investigação</AlertTitle>
                    <AlertDescription>
                      {investigationResult.targetName}{" "}
                      {investigationResult.isAssassin ? "é um Assassino!" : "não é um Assassino."}
                    </AlertDescription>
                  </Alert>
                ) : myAction ? (
                  <Alert className="bg-blue-900/30 border-blue-800 text-blue-200">
                    <UserCheck className="h-4 w-4 text-blue-400" />
                    <AlertTitle>Ação realizada</AlertTitle>
                    <AlertDescription>Você já escolheu seu alvo. Aguardando resultado...</AlertDescription>
                  </Alert>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {aliveOthers.map((player, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        className="h-auto py-2 text-white bg-slate-800 border-slate-700 hover:bg-blue-900/30 hover:border-blue-700"
                        onClick={() => performNightAction(player.id)}
                      >
                        {player.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {myRole === "anjo" && (
              <div className="p-5 bg-yellow-900/20 rounded-lg border border-yellow-900/30 shadow-inner transition-all">
                <h3 className="flex items-center gap-2 text-lg font-semibold mb-3 text-yellow-300">
                  <Shield className="text-yellow-400" /> Você é um Anjo
                </h3>
                <p className="text-sm mb-4 text-yellow-200">Escolha um jogador para proteger esta noite.</p>

                {myAction ? (
                  <Alert className="bg-green-900/20 border-green-800 text-green-200">
                    <ThumbsUp className="h-4 w-4 text-green-400" />
                    <AlertTitle>Ação realizada</AlertTitle>
                    <AlertDescription>Você já escolheu quem proteger. Aguardando outros jogadores...</AlertDescription>
                  </Alert>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {players
                      .filter((p) => p.alive)
                      .map((player, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          className="h-auto py-2 text-white bg-slate-800 border-slate-700 hover:bg-yellow-900/30 hover:border-yellow-700"
                          onClick={() => performNightAction(player.id)}
                        >
                          {player.name}
                        </Button>
                      ))}
                  </div>
                )}
              </div>
            )}

            {myRole === "cidadao" && (
              <div className="p-5 bg-slate-800 rounded-lg border border-slate-700 shadow-inner transition-all">
                <h3 className="flex items-center gap-2 text-lg font-semibold mb-3 text-white">
                  <Users className="text-slate-400" /> Você é um Cidadão
                </h3>
                <p className="text-sm text-slate-300">
                  Aguarde enquanto os jogadores com papéis especiais realizam suas ações...
                </p>
                <div className="p-4 flex items-center justify-center mt-3">
                  <div className="animate-pulse flex items-center space-x-2 text-slate-400">
                    <div className="h-3 w-3 bg-indigo-500 rounded-full"></div>
                    <div className="h-3 w-3 bg-indigo-500 rounded-full"></div>
                    <div className="h-3 w-3 bg-indigo-500 rounded-full"></div>
                    <span className="text-sm">Aguardando ações</span>
                  </div>
                </div>
              </div>
            )}

            <div className="p-5 bg-slate-800 rounded-lg border border-slate-700 shadow-inner transition-all">
              <h3 className="text-lg font-semibold mb-3 text-white">Jogadores Vivos</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {players
                  .filter((p) => p.alive)
                  .map((player, index) => (
                    <div key={index} className="p-3 rounded-lg bg-slate-700 border border-slate-600 transition-all">
                      <span className="text-white">{player.name}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Renderizar a fase diurna
  const renderDay = () => (
    <Card className="w-full bg-amber-50 text-slate-900 border-amber-300 shadow-lg overflow-hidden transition-all duration-500">
      <CardHeader className="bg-amber-100">
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2 text-amber-900">
            <Sun className="text-amber-500" /> Dia na Cidade - Rodada {gameState.round}
          </CardTitle>
          <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300">
            {getRoleIcon(myRole)} Seu papel: {translateRole(myRole)}
          </Badge>
        </div>
        <CardDescription className="text-amber-900/70">
          A cidade acorda e os cidadãos discutem quem pode ser o assassino.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-6">
          {gameState.nightMessage && gameState.nightMessage.length > 0 && (
            <div className="p-4 bg-amber-100 rounded-lg border border-amber-200 shadow-inner">
              <h3 className="text-lg font-semibold mb-2 text-amber-900">Acontecimentos da Noite</h3>
              <ul className="space-y-1 text-amber-800">
                {gameState.nightMessage.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-amber-900">Jogadores Vivos</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {players
                .filter((p) => p.alive)
                .map((player, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                      selectedPlayer === player.id
                        ? "bg-amber-200 border-amber-400 shadow-md transform scale-105"
                        : "bg-amber-100 border-amber-200 hover:bg-amber-200 hover:border-amber-300"
                    }`}
                    onClick={() => setSelectedPlayer(player.id)}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-amber-900">{player.name}</span>
                    </div>
                    <div className="mt-2 text-sm text-amber-900/70 flex items-center gap-1">
                      <ThumbsUp className="h-3 w-3" /> Votos: {voteCount[player.id] || 0}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {selectedPlayer && players.find((p) => p.id === selectedPlayer)?.alive && (
            <div className="p-4 bg-amber-200 rounded-lg border border-amber-300 shadow-md transition-all">
              <h3 className="text-lg font-semibold mb-2 text-amber-900">
                {players.find((p) => p.id === selectedPlayer)?.name}
              </h3>

              {myVote ? (
                <Alert className="bg-amber-300 border-amber-400 text-amber-900">
                  <ThumbsUp className="h-4 w-4 text-amber-800" />
                  <AlertTitle>Voto registrado</AlertTitle>
                  <AlertDescription>
                    Você votou em {players.find((p) => p.id === myVote)?.name}. Aguardando outros jogadores...
                  </AlertDescription>
                </Alert>
              ) : (
                <Button
                  className="bg-amber-500 text-amber-950 hover:bg-amber-600 font-medium transition-all"
                  onClick={() => votePlayer(selectedPlayer)}
                  disabled={selectedPlayer === socket?.id}
                >
                  Votar neste jogador
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )

  // Renderizar a tela de fim de jogo
  const renderGameEnd = () => (
    <Card className="w-full border-slate-700 shadow-lg overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <CardTitle className="flex items-center gap-2">
          <Award className="text-yellow-300" /> Fim do Jogo
        </CardTitle>
        <CardDescription className="text-white/80">O jogo terminou após {gameState.round} rodadas.</CardDescription>
      </CardHeader>
      <CardContent className="p-6 bg-slate-900">
        <div className="space-y-6">
          <div className="p-6 text-center bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg text-white shadow-lg">
            <h2 className="text-3xl font-bold mb-4">
              {gameState.winner === "assassinos" ? "Os Assassinos Venceram!" : "Os Cidadãos Venceram!"}
            </h2>
            <p className="text-xl">
              {gameState.winner === "assassinos"
                ? "Os assassinos eliminaram cidadãos suficientes para dominar a cidade."
                : "Todos os assassinos foram eliminados e a cidade está salva!"}
            </p>
          </div>

          <Tabs defaultValue="vivos" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-slate-800 text-white">
              <TabsTrigger value="vivos" className="data-[state=active]:bg-slate-700">
                Jogadores Vivos
              </TabsTrigger>
              <TabsTrigger value="todos" className="data-[state=active]:bg-slate-700">
                Todos os Jogadores
              </TabsTrigger>
            </TabsList>
            <TabsContent value="vivos" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {players
                  .filter((p) => p.alive)
                  .map((player, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-lg border bg-slate-800 border-slate-700 transition-all hover:bg-slate-750"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-white">{player.name}</span>
                        <Badge
                          variant="outline"
                          className={`bg-opacity-20 flex items-center gap-1 ${
                            player.role === "assassino"
                              ? "bg-red-900/20 text-red-400 border-red-900/50"
                              : player.role === "detetive"
                                ? "bg-blue-900/20 text-blue-400 border-blue-900/50"
                                : player.role === "anjo"
                                  ? "bg-yellow-900/20 text-yellow-400 border-yellow-900/50"
                                  : "bg-green-900/20 text-green-400 border-green-900/50"
                          }`}
                        >
                          {getRoleIcon(player.role)} {translateRole(player.role)}
                        </Badge>
                      </div>
                      <div className="mt-2 text-sm text-slate-300">
                        Status: <span className="text-green-400">Sobreviveu</span>
                      </div>
                    </div>
                  ))}
              </div>
            </TabsContent>
            <TabsContent value="todos" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {players.map((player, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border ${
                      player.alive ? "bg-slate-800 border-slate-700" : "bg-slate-900 border-slate-800 opacity-70"
                    } transition-all hover:bg-slate-750`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-white">{player.name}</span>
                      <Badge
                        variant="outline"
                        className={`bg-opacity-20 flex items-center gap-1 ${
                          player.role === "assassino"
                            ? "bg-red-900/20 text-red-400 border-red-900/50"
                            : player.role === "detetive"
                              ? "bg-blue-900/20 text-blue-400 border-blue-900/50"
                              : player.role === "anjo"
                                ? "bg-yellow-900/20 text-yellow-400 border-yellow-900/50"
                                : "bg-green-900/20 text-green-400 border-green-900/50"
                        }`}
                      >
                        {getRoleIcon(player.role)} {translateRole(player.role)}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-slate-300">
                      Status:{" "}
                      {player.alive ? (
                        <span className="text-green-400">Sobreviveu</span>
                      ) : (
                        <span className="text-red-400">Eliminado</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
      <CardFooter className="bg-slate-900 border-t border-slate-700 p-6">
        {isHost && (
          <Button
            onClick={restartGame}
            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold transition-all"
          >
            Jogar Novamente
          </Button>
        )}
      </CardFooter>
    </Card>
  )

  // Diálogo para mostrar as regras do jogo
  const renderRulesDialog = () => (
    <Dialog open={showGameRules} onOpenChange={setShowGameRules}>
      <DialogContent className="sm:max-w-[600px] bg-slate-900 text-white border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-amber-400">Regras do Jogo</DialogTitle>
          <DialogDescription className="text-slate-400">Como jogar "Cidade Dorme"</DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-6 p-1">
            <div className="p-3 bg-slate-800 rounded-lg">
              <h3 className="text-lg font-bold text-amber-400">Objetivo</h3>
              <p className="text-slate-300 mt-2">
                "Cidade Dorme" é um jogo de dedução social onde os jogadores são divididos em dois grupos principais: os
                Cidadãos (incluindo Detetives e Anjos) e os Assassinos. Cada grupo tem objetivos opostos.
              </p>
            </div>

            <div className="p-3 bg-slate-800 rounded-lg">
              <h3 className="text-lg font-bold text-amber-400">Papéis</h3>
              <ul className="list-disc pl-5 space-y-3 mt-2 text-slate-300">
                <li>
                  <span className="font-medium text-red-400">Assassinos:</span> Seu objetivo é eliminar os cidadãos até
                  que seu número seja igual ou maior que o dos cidadãos restantes.
                </li>
                <li>
                  <span className="font-medium text-blue-400">Detetives:</span> Podem investigar um jogador por noite
                  para descobrir se é assassino.
                </li>
                <li>
                  <span className="font-medium text-yellow-400">Anjos:</span> Podem proteger um jogador por noite contra
                  o ataque dos assassinos.
                </li>
                <li>
                  <span className="font-medium text-green-400">Cidadãos:</span> Não possuem habilidades especiais, mas
                  participam das discussões e votações.
                </li>
              </ul>
            </div>

            <div className="p-3 bg-slate-800 rounded-lg">
              <h3 className="text-lg font-bold text-amber-400">Fases do Jogo</h3>
              <ul className="list-disc pl-5 space-y-3 mt-2 text-slate-300">
                <li>
                  <span className="font-medium text-indigo-400">Noite:</span> Todos os jogadores "dormem" (fecham os
                  olhos). Os assassinos escolhem uma vítima, os detetives investigam um jogador e os anjos protegem
                  alguém.
                </li>
                <li>
                  <span className="font-medium text-amber-400">Dia:</span> Todos "acordam" e descobrem quem foi
                  eliminado durante a noite (se houver). Os jogadores discutem e votam para eliminar um suspeito.
                </li>
              </ul>
            </div>

            <div className="p-3 bg-slate-800 rounded-lg">
              <h3 className="text-lg font-bold text-amber-400">Condições de Vitória</h3>
              <ul className="list-disc pl-5 space-y-3 mt-2 text-slate-300">
                <li>
                  <span className="font-medium text-red-400">Assassinos:</span> Vencem quando seu número é igual ou
                  maior que o número de cidadãos restantes.
                </li>
                <li>
                  <span className="font-medium text-green-400">Cidadãos:</span> Vencem quando todos os assassinos são
                  eliminados.
                </li>
              </ul>
            </div>

            <div className="p-3 bg-slate-800 rounded-lg">
              <h3 className="text-lg font-bold text-amber-400">Regras Adicionais</h3>
              <ul className="list-disc pl-5 space-y-3 mt-2 text-slate-300">
                <li>Um jogador protegido pelo anjo não pode ser eliminado durante a noite.</li>
                <li>Durante o dia, todos os jogadores devem votar. O jogador mais votado é eliminado.</li>
                <li>Em caso de empate na votação, nenhum jogador é eliminado naquela rodada.</li>
                <li>Os jogadores eliminados não podem revelar seu papel ou dar dicas aos jogadores vivos.</li>
              </ul>
            </div>

            <div className="p-3 bg-slate-800 rounded-lg">
              <h3 className="text-lg font-bold text-amber-400">Distribuição de Papéis</h3>
              <ul className="list-disc pl-5 space-y-3 mt-2 text-slate-300">
                <li>7-8 jogadores: 1 assassino, 1 detetive, 1 anjo</li>
                <li>9-10 jogadores: 2 assassinos, 1 detetive, 1 anjo</li>
                <li>11-12 jogadores: 2 assassinos, 2 detetives, 1 anjo</li>
              </ul>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button
            onClick={() => setShowGameRules(false)}
            className="bg-amber-500 hover:bg-amber-600 text-black font-bold"
          >
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  // Renderizar o componente principal
  return (
    <div className="w-full">
      {!isServerConnected && renderConnection()}
      {isServerConnected && !isConnected && renderLobby()}
      {isServerConnected && isConnected && gameState.phase === "lobby" && renderLobby()}
      {isServerConnected && isConnected && gameState.phase === "night" && renderNight()}
      {isServerConnected && isConnected && gameState.phase === "day" && renderDay()}
      {isServerConnected && isConnected && gameState.phase === "end" && renderGameEnd()}
      {renderRulesDialog()}
    </div>
  )
}

