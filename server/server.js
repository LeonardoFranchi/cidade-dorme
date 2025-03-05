const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")

const app = express()
app.use(cors())
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
})

// Armazenar informações das salas de jogo
const rooms = {}

// Função para distribuir papéis
function assignRoles(players) {
  const playerCount = players.length

  // Determinar o número de cada papel com base no número total de jogadores
  let assassinCount = 1
  let detectiveCount = 1
  const angelCount = 1

  if (playerCount >= 9) {
    assassinCount = 2
  }

  if (playerCount >= 11) {
    detectiveCount = 2
  }

  // Criar array de papéis
  const roles = [
    ...Array(assassinCount).fill("assassino"),
    ...Array(detectiveCount).fill("detetive"),
    ...Array(angelCount).fill("anjo"),
    ...Array(playerCount - assassinCount - detectiveCount - angelCount).fill("cidadao"),
  ]

  // Embaralhar os papéis
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[roles[i], roles[j]] = [roles[j], roles[i]]
  }

  // Atribuir papéis aos jogadores
  return players.map((player, index) => ({
    ...player,
    role: roles[index],
    alive: true,
    protected: false,
    investigated: false,
  }))
}

// Verificar condições de vitória
function checkGameEnd(players) {
  const alivePlayers = players.filter((p) => p.alive)
  const aliveAssassins = alivePlayers.filter((p) => p.role === "assassino")

  // Se não houver mais assassinos, os cidadãos ganham
  if (aliveAssassins.length === 0) {
    return "cidadaos"
  }

  // Se o número de assassinos for igual ou maior que o número de cidadãos, os assassinos ganham
  if (aliveAssassins.length >= alivePlayers.length - aliveAssassins.length) {
    return "assassinos"
  }

  // O jogo continua
  return null
}

io.on("connection", (socket) => {
  console.log(`Usuário conectado: ${socket.id}`)

  // Criar uma nova sala
  socket.on("create_room", (username) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase()

    rooms[roomId] = {
      id: roomId,
      host: socket.id,
      players: [
        {
          id: socket.id,
          name: username,
          isHost: true,
        },
      ],
      gameState: {
        phase: "lobby",
        round: 0,
        nightActions: {
          assassinTarget: null,
          detectiveTarget: null,
          angelTarget: null,
        },
        dayVotes: {},
        winner: null,
        nightMessage: [],
        dayMessage: [],
      },
    }

    socket.join(roomId)
    socket.emit("room_created", { roomId, isHost: true })
    io.to(roomId).emit("update_players", rooms[roomId].players)

    console.log(`Sala criada: ${roomId} por ${username}`)
  })

  // Entrar em uma sala existente
  socket.on("join_room", ({ roomId, username }) => {
    roomId = roomId.toUpperCase()

    if (!rooms[roomId]) {
      socket.emit("error", { message: "Sala não encontrada!" })
      return
    }

    if (rooms[roomId].gameState.phase !== "lobby") {
      socket.emit("error", { message: "O jogo já começou nesta sala!" })
      return
    }

    // Verificar se o nome de usuário já existe na sala
    if (rooms[roomId].players.some((p) => p.name === username)) {
      socket.emit("error", { message: "Este nome de usuário já está em uso nesta sala!" })
      return
    }

    rooms[roomId].players.push({
      id: socket.id,
      name: username,
      isHost: false,
    })

    socket.join(roomId)
    socket.emit("room_joined", { roomId, isHost: false })
    io.to(roomId).emit("update_players", rooms[roomId].players)

    console.log(`${username} entrou na sala: ${roomId}`)
  })

  // Iniciar o jogo
  socket.on("start_game", (roomId) => {
    if (!rooms[roomId] || rooms[roomId].host !== socket.id) {
      return
    }

    if (rooms[roomId].players.length < 7) {
      socket.emit("error", { message: "São necessários pelo menos 7 jogadores para iniciar!" })
      return
    }

    if (rooms[roomId].players.length > 12) {
      socket.emit("error", { message: "O jogo suporta no máximo 12 jogadores!" })
      return
    }

    // Atribuir papéis aos jogadores
    rooms[roomId].players = assignRoles(rooms[roomId].players)

    // Iniciar o jogo
    rooms[roomId].gameState = {
      phase: "night",
      round: 1,
      nightActions: {
        assassinTarget: null,
        detectiveTarget: null,
        angelTarget: null,
      },
      dayVotes: {},
      winner: null,
      nightMessage: [],
      dayMessage: [],
    }

    // Enviar informações do jogo para cada jogador
    rooms[roomId].players.forEach((player) => {
      io.to(player.id).emit("game_started", {
        role: player.role,
        players: rooms[roomId].players.map((p) => ({
          id: p.id,
          name: p.name,
          alive: p.alive,
          // Não enviar o papel dos outros jogadores
          role: p.id === player.id ? p.role : null,
        })),
        gameState: rooms[roomId].gameState,
      })
    })

    console.log(`Jogo iniciado na sala: ${roomId}`)
  })

  // Ação noturna (assassino, detetive, anjo)
  socket.on("night_action", ({ roomId, targetId, action }) => {
    console.log(`Ação noturna recebida: ${action} de ${socket.id} para ${targetId} em ${roomId}`)

    if (!rooms[roomId]) {
      socket.emit("error", { message: "Sala não encontrada!" })
      return
    }

    const room = rooms[roomId]
    const player = room.players.find((p) => p.id === socket.id)
    const target = room.players.find((p) => p.id === targetId)

    if (!player || !player.alive || room.gameState.phase !== "night") {
      socket.emit("error", { message: "Ação inválida!" })
      return
    }

    // Verificar se o alvo existe e está vivo
    if (!target || !target.alive) {
      socket.emit("error", { message: "Alvo inválido! O jogador não existe ou não está mais vivo." })
      return
    }

    // Verificar se o jogador tem o papel correto para a ação
    if (action === "kill" && player.role !== "assassino") {
      socket.emit("error", { message: "Você não é um assassino!" })
      return
    }
    if (action === "investigate" && player.role !== "detetive") {
      socket.emit("error", { message: "Você não é um detetive!" })
      return
    }
    if (action === "protect" && player.role !== "anjo") {
      socket.emit("error", { message: "Você não é um anjo!" })
      return
    }

    // Registrar a ação
    if (action === "kill") {
      room.gameState.nightActions.assassinTarget = targetId
      console.log(`Assassino ${player.name} escolheu matar ${target.name}`)
    } else if (action === "investigate") {
      room.gameState.nightActions.detectiveTarget = targetId

      // Informar o resultado da investigação apenas para o detetive
      socket.emit("investigation_result", {
        targetName: target.name,
        isAssassin: target.role === "assassino",
      })
      console.log(`Detetive ${player.name} investigou ${target.name}`)
    } else if (action === "protect") {
      room.gameState.nightActions.angelTarget = targetId
      console.log(`Anjo ${player.name} protegeu ${target.name}`)
    }

    // Informar que a ação foi registrada
    socket.emit("action_registered", { action, targetId })

    // Verificar se todas as ações noturnas foram realizadas
    const aliveAssassins = room.players.filter((p) => p.role === "assassino" && p.alive)
    const aliveDetectives = room.players.filter((p) => p.role === "detetive" && p.alive)
    const aliveAngels = room.players.filter((p) => p.role === "anjo" && p.alive)

    const assassinsActed = aliveAssassins.length === 0 || room.gameState.nightActions.assassinTarget !== null
    const detectivesActed = aliveDetectives.length === 0 || room.gameState.nightActions.detectiveTarget !== null
    const angelsActed = aliveAngels.length === 0 || room.gameState.nightActions.angelTarget !== null

    console.log(
      `Estado das ações da noite: Assassinos=${assassinsActed}, Detetives=${detectivesActed}, Anjos=${angelsActed}`,
    )

    // Se todas as ações foram realizadas, passar para o dia
    if (assassinsActed && detectivesActed && angelsActed) {
      console.log(`Todas as ações noturnas realizadas, processando a noite na sala ${roomId}`)
      processNight(roomId)
    }
  })

  // Voto durante o dia
  socket.on("day_vote", ({ roomId, targetId }) => {
    console.log(`Voto recebido de ${socket.id} para ${targetId} em ${roomId}`)

    if (!rooms[roomId]) {
      socket.emit("error", { message: "Sala não encontrada!" })
      return
    }

    const room = rooms[roomId]
    const player = room.players.find((p) => p.id === socket.id)

    if (!player || !player.alive || room.gameState.phase !== "day") {
      socket.emit("error", { message: "Voto inválido!" })
      return
    }

    // Verificar se o alvo existe e está vivo
    const target = room.players.find((p) => p.id === targetId)
    if (!target || !target.alive || targetId === socket.id) {
      socket.emit("error", {
        message: "Alvo inválido! O jogador não existe, não está vivo, ou você não pode votar em si mesmo.",
      })
      return
    }

    // Registrar o voto
    room.gameState.dayVotes[socket.id] = targetId

    // Informar que o voto foi registrado
    socket.emit("vote_registered", { targetId })

    // Atualizar contagem de votos para todos
    const voteCount = {}
    Object.values(room.gameState.dayVotes).forEach((id) => {
      voteCount[id] = (voteCount[id] || 0) + 1
    })

    io.to(roomId).emit("vote_update", { voteCount })

    // Verificar se todos os jogadores vivos votaram
    const alivePlayers = room.players.filter((p) => p.alive)
    const allVoted = Object.keys(room.gameState.dayVotes).length === alivePlayers.length

    console.log(`Votos: ${Object.keys(room.gameState.dayVotes).length}/${alivePlayers.length}`)

    // Se todos votaram, processar os resultados
    if (allVoted) {
      console.log(`Todos os votos recebidos, processando o dia na sala ${roomId}`)
      processDay(roomId)
    }
  })

  // Processar a fase noturna
  function processNight(roomId) {
    console.log(`Processando fase noturna na sala ${roomId}`)
    const room = rooms[roomId]
    const { assassinTarget, detectiveTarget, angelTarget } = room.gameState.nightActions
    const nightMessages = []

    // Resetar proteção da noite anterior
    room.players.forEach((player) => {
      player.protected = false
    })

    // Aplicar proteção do anjo
    if (angelTarget !== null) {
      const protectedPlayer = room.players.find((p) => p.id === angelTarget)
      if (protectedPlayer) {
        protectedPlayer.protected = true
        console.log(`Jogador ${protectedPlayer.name} protegido pelo anjo`)
      }
    }

    // Processar ação dos assassinos
    if (assassinTarget !== null) {
      const targetPlayer = room.players.find((p) => p.id === assassinTarget)
      if (targetPlayer) {
        if (targetPlayer.protected) {
          nightMessages.push(`Um jogador foi salvo pelo Anjo esta noite!`)
          console.log(`${targetPlayer.name} foi salvo pelo anjo`)
        } else {
          targetPlayer.alive = false
          nightMessages.push(`${targetPlayer.name} foi assassinado durante a noite!`)
          console.log(`${targetPlayer.name} foi morto`)
        }
      }
    }

    // Verificar se o jogo terminou
    const winner = checkGameEnd(room.players)

    // Atualizar o estado do jogo
    room.gameState.phase = winner ? "end" : "day"
    room.gameState.nightActions = {
      assassinTarget: null,
      detectiveTarget: null,
      angelTarget: null,
    }
    room.gameState.nightMessage = nightMessages
    room.gameState.winner = winner

    console.log(`Fase noturna concluída, nova fase: ${room.gameState.phase}`)

    // Quando o jogo termina, enviar todos os papéis para todos os jogadores
    if (winner) {
      // Enviar atualizações finais revelando todos os papéis
      io.to(roomId).emit("game_ended", {
        players: room.players, // Enviar todos os jogadores com seus papéis
        winner,
        message:
          winner === "assassinos"
            ? "Os Assassinos venceram! Eles eliminaram cidadãos suficientes para dominar a cidade."
            : "Os Cidadãos venceram! Todos os Assassinos foram eliminados.",
      })
    } else {
      // Enviar atualizações para cada jogador (sem revelar papéis durante o jogo)
      room.players.forEach((player) => {
        io.to(player.id).emit("night_processed", {
          players: room.players.map((p) => ({
            id: p.id,
            name: p.name,
            alive: p.alive,
            role: p.id === player.id ? p.role : null,
          })),
          gameState: {
            ...room.gameState,
            message: "O dia amanheceu na cidade...",
          },
        })
      })
    }
  }

  // Processar a fase diurna
  function processDay(roomId) {
    console.log(`Processando fase diurna na sala ${roomId}`)
    const room = rooms[roomId]
    const { dayVotes } = room.gameState
    const dayMessages = []

    // Contar votos
    const voteCounts = {}
    Object.values(dayVotes).forEach((targetId) => {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1
    })

    console.log(`Contagem de votos:`, voteCounts)

    // Encontrar o jogador mais votado
    let maxVotes = 0
    let eliminatedPlayerId = null
    let tie = false

    Object.entries(voteCounts).forEach(([playerId, votes]) => {
      if (votes > maxVotes) {
        maxVotes = votes
        eliminatedPlayerId = playerId
        tie = false
      } else if (votes === maxVotes) {
        tie = true
      }
    })

    // Processar resultado da votação
    if (tie || eliminatedPlayerId === null) {
      dayMessages.push("A votação terminou em empate. Ninguém foi eliminado hoje.")
      console.log(`Resultado da votação: Empate, ninguém foi eliminado`)
    } else {
      const eliminatedPlayer = room.players.find((p) => p.id === eliminatedPlayerId)
      if (eliminatedPlayer) {
        eliminatedPlayer.alive = false
        dayMessages.push(`${eliminatedPlayer.name} foi eliminado pela votação da cidade!`)
        console.log(`${eliminatedPlayer.name} foi eliminado pela votação`)
      }
    }

    // Verificar se o jogo terminou
    const winner = checkGameEnd(room.players)
    console.log(`Verificação de fim de jogo: ${winner || "jogo continua"}`)

    // Atualizar o estado do jogo
    room.gameState.phase = winner ? "end" : "night"
    room.gameState.round = winner ? room.gameState.round : room.gameState.round + 1
    room.gameState.dayVotes = {}
    room.gameState.dayMessage = dayMessages
    room.gameState.winner = winner

    console.log(`Fase diurna concluída, nova fase: ${room.gameState.phase}, rodada: ${room.gameState.round}`)

    // Quando o jogo termina, enviar todos os papéis para todos os jogadores
    if (winner) {
      // Enviar atualizações finais revelando todos os papéis
      io.to(roomId).emit("game_ended", {
        players: room.players, // Enviar todos os jogadores com seus papéis
        winner,
        message:
          winner === "assassinos"
            ? "Os Assassinos venceram! Eles eliminaram cidadãos suficientes para dominar a cidade."
            : "Os Cidadãos venceram! Todos os Assassinos foram eliminados.",
      })
    } else {
      // Enviar atualizações para cada jogador (sem revelar papéis durante o jogo)
      room.players.forEach((player) => {
        io.to(player.id).emit("day_processed", {
          players: room.players.map((p) => ({
            id: p.id,
            name: p.name,
            alive: p.alive,
            role: p.id === player.id ? p.role : null,
          })),
          gameState: {
            ...room.gameState,
            message: "A noite caiu sobre a cidade...",
          },
        })
      })
    }
  }

  // Reiniciar o jogo
  socket.on("restart_game", (roomId) => {
    if (!rooms[roomId] || rooms[roomId].host !== socket.id) {
      return
    }

    // Resetar o estado do jogo
    rooms[roomId].gameState = {
      phase: "lobby",
      round: 0,
      nightActions: {
        assassinTarget: null,
        detectiveTarget: null,
        angelTarget: null,
      },
      dayVotes: {},
      winner: null,
      nightMessage: [],
      dayMessage: [],
    }

    // Resetar os jogadores
    rooms[roomId].players = rooms[roomId].players.map((player) => ({
      id: player.id,
      name: player.name,
      isHost: player.id === rooms[roomId].host,
    }))

    io.to(roomId).emit("game_restarted", {
      players: rooms[roomId].players,
      gameState: rooms[roomId].gameState,
    })

    console.log(`Jogo reiniciado na sala: ${roomId}`)
  })

  // Desconexão
  socket.on("disconnect", () => {
    console.log(`Usuário desconectado: ${socket.id}`)

    // Remover o jogador de todas as salas
    Object.keys(rooms).forEach((roomId) => {
      const room = rooms[roomId]
      const playerIndex = room.players.findIndex((p) => p.id === socket.id)

      if (playerIndex !== -1) {
        // Se o host saiu, transferir host para outro jogador ou fechar a sala
        if (room.host === socket.id) {
          const remainingPlayers = room.players.filter((p) => p.id !== socket.id)

          if (remainingPlayers.length > 0) {
            // Transferir host para o próximo jogador
            room.host = remainingPlayers[0].id
            remainingPlayers[0].isHost = true

            room.players = remainingPlayers
            io.to(roomId).emit("host_changed", { newHost: remainingPlayers[0].id })
            io.to(roomId).emit("update_players", room.players)
          } else {
            // Fechar a sala se não houver mais jogadores
            delete rooms[roomId]
          }
        } else {
          // Remover o jogador da sala
          room.players.splice(playerIndex, 1)
          io.to(roomId).emit("update_players", room.players)

          // Se o jogo estiver em andamento, verificar se isso afeta o resultado
          if (room.gameState.phase !== "lobby") {
            const winner = checkGameEnd(room.players)

            if (winner) {
              room.gameState.phase = "end"
              room.gameState.winner = winner

              // Enviar atualizações finais revelando todos os papéis
              io.to(roomId).emit("game_ended", {
                players: room.players, // Enviar todos os jogadores com seus papéis
                winner,
                message:
                  winner === "assassinos"
                    ? "Os Assassinos venceram! Eles eliminaram cidadãos suficientes para dominar a cidade."
                    : "Os Cidadãos venceram! Todos os Assassinos foram eliminados.",
              })
            }
          }
        }
      }
    })
  })
})

// Iniciar o servidor
const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})

