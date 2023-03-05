const express = require('express')

// Setup Express server
const app = express()
const http = require('http').Server(app)

// Kết nối Socket.io tới server
const io = require('socket.io')(http)

// Thư mục web app
app.use(express.static('public'))

/** Quản lý các hành vi cảu mỗi kết nối socket */
io.on('connection', (socket) => {
  console.log(`User Connected - Socket ID ${socket.id}`)

  // Chứa các phòng mà socket đã kết nối Store the room that the socket is connected to.
  let currentRoom = null

  /** Xử lý yêu câu vào một phòng*/
  socket.on('JOIN', (roomName) => {
    // Thông tin phòng chat
    let room = io.sockets.adapter.rooms[roomName]

    // Từ chối yêu cầu tham gia nếu có nhiều hơn một kết nối 
    if (room && room.length > 1) {
      // Thông báo cho người dùng rằng thông báo của họ đã bị từ chối
      io.to(socket.id).emit('ROOM_FULL', null)

      // Thông báo trong phòng rằng có ai đó đang muốn vào phòng
      socket.broadcast.to(roomName).emit('INTRUSION_ATTEMPT', null)
    } else {
      // Rời phòng hiện tại
      socket.leave(currentRoom)

      // Thông báo rằng ai đó đã rời phòng 
      socket.broadcast.to(currentRoom).emit('USER_DISCONNECTED', null)

      // Vào phòng mới
      currentRoom = roomName
      socket.join(currentRoom)

      // Thông báo người dùng đã vào phòng thành công
      io.to(socket.id).emit('ROOM_JOINED', currentRoom)

      // Thông báo với chủ phòng rằng vừa có người vào phòng
      socket.broadcast.to(currentRoom).emit('NEW_CONNECTION', null)
    }
  })

  /** Gửi tin nhắn đã nhận cho phòng */
  socket.on('MESSAGE', (msg) => {
    console.log(`New Message - ${msg.text}`)
    socket.broadcast.to(currentRoom).emit('MESSAGE', msg)
  })

  /** Gửi khóa công khai mới cho phòng */
  socket.on('PUBLIC_KEY', (key) => {
    socket.broadcast.to(currentRoom).emit('PUBLIC_KEY', key)
  })

  /** Gửi thông báo mất kết nối tới thành viên trong phòng */
  socket.on('disconnect', () => {
    socket.broadcast.to(currentRoom).emit('USER_DISCONNECTED', null)
  })
})

// Start server
const port = process.env.PORT || 3000
http.listen(port, () => {
  console.log(`Chat server listening on port ${port}.`)
})
