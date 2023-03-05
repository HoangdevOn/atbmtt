/** The core Vue instance controlling the UI */
const vm = new Vue({
  el: "#vue-instance",
  data() {
    return {
      cryptWorker: null,
      socket: null,
      originPublicKey: null,
      destinationPublicKey: null,
      messages: [],
      secret: "",
      notifications: [],
      currentRoom: null,
      pendingRoom: Math.floor(Math.random() * 1000),
      draft: "",
    };
  },
  async created() {
    this.addNotification(
      "Xin chào! Hãy chờ một chút để chúng tôi tạo khóa mới."
    );

    // Khởi tạo luồng mã hóa webworker
    this.cryptWorker = new Worker("crypto-worker.js");
    // this.cryptWorker = new Worker("../crypto-workers/rsa-crypto-worker.js");

    // Khởi tạo cặp khóa và vào phòng mặc định
    this.originPublicKey = await this.getWebWorkerResponse("generate-keys");
    this.addNotification(
      `Nickname của bạn là - ${this.getKeySnippet(this.originPublicKey)}`
    );

    // Khởi tạo socket Initialize socketio
    this.socket = io();
    this.setupSocketListeners();
  },
  methods: {
    /** Setup Socket.io event listeners */
    setupSocketListeners() {
      // Tự động vào phòng mặc định đang kết nối
      this.socket.on("connect", () => {
        this.addNotification("Kết nối tới server.");
        this.joinRoom();
      });

      // Thông báo cho người dùng rằng đã mất kết nối
      this.socket.on("disconnect", () =>
        this.addNotification("Mất kết nối :(")
      );

      // Giải mã và hiển thị tin nhắn khi nhận
      this.socket.on("MESSAGE", async (message) => {
        // Chỉ giải mã tin nhắn được mã hóa với khóa công khai của người dùng
        if (message.recipient === this.originPublicKey) {
          // Giải mã tin nhắn trong luồng của webworker
          this.secret = message.text;
          message.text = await this.getWebWorkerResponse(
            "decrypt",
            message.text
          );
          this.messages.push(message);
        }
      });

      // Khi một người dùng vào phòng, gửi cho họ khoa
      this.socket.on("NEW_CONNECTION", () => {
        this.addNotification("Đã có người vào phòng.");
        this.sendPublicKey();
      });

      //  Phát khóa công khai khi một phòng mới được tham gia
      this.socket.on("ROOM_JOINED", (newRoom) => {
        this.currentRoom = newRoom;
        this.addNotification(`Vào phòng số - ${this.currentRoom}`);
        this.sendPublicKey();
      });

      // Lưu khóa công khai khi được nhận
      this.socket.on("PUBLIC_KEY", (key) => {
        this.addNotification(
          `Khóa công khai đã nhận - ${this.getKeySnippet(key)}`
        );
        this.destinationPublicKey = key;
      });

      // Xóa khóa công khai khi rời khỏi phòng
      this.socket.on("user disconnected", () => {
        this.notify(
          `Người dùng mất kết nối- ${this.getKeySnippet(this.destinationKey)}`
        );
        this.destinationPublicKey = null;
      });

      // Thông báo người dùng răng phòng đã đầy
      this.socket.on("ROOM_FULL", () => {
        this.addNotification(
          `Không thể vào phòng ${this.pendingRoom}, đã đầy !!!`
        );

        // Vào một phòng bất kì
        this.pendingRoom = Math.floor(Math.random() * 1000);
        this.joinRoom();
      });

      // Thông báo phòng rằng có người thứ 3 muốn vào phòng
      this.socket.on("INTRUSION_ATTEMPT", () => {
        this.addNotification("Một người thứ 3 muốn vào phòng của 2 bạn.");
      });
    },

    /** Mã hóa và gửi tin nhắn hiện tại*/
    async sendMessage() {
      // Don't send message if there is nothing to send
      if (!this.draft || this.draft === "") {
        return;
      }

      let message = Immutable.Map({
        text: this.draft,
        recipient: this.destinationPublicKey,
        sender: this.originPublicKey,
      });

      // Reset the UI input draft text
      this.draft = "";

      // Thêm ngay tin nhắn (không được mã hóa) vào giao diện người dùng cục bộ
      this.addMessage(message.toObject());

      if (this.destinationPublicKey) {
        // Mã hóa tin nhắn bằng public key của người khác
        const encryptedText = await this.getWebWorkerResponse("encrypt", [
          message.get("text"),
          this.destinationPublicKey,
        ]);
        const encryptedMsg = message.set("text", encryptedText);

        // Gửi tin nhắn đã mã hóa
        this.socket.emit("MESSAGE", encryptedMsg.toObject());
      }
    },

    /** Vào một phòng cụ thể */
    joinRoom() {
      if (this.pendingRoom !== this.currentRoom && this.originPublicKey) {
        this.addNotification(`Đang kết nối tới phòng - ${this.pendingRoom}`);

        // Reset biến trạng thái của phòng
        this.messages = [];
        this.destinationPublicKey = null;

        // Gửi yêu cầu vào phòng.
        this.socket.emit("JOIN", this.pendingRoom);
      }
    },

    /** Thêm tin nhắn vào giao diện*/
    addMessage(message) {
      this.messages.push(message);
      this.autoscroll(this.$refs.chatContainer);
    },

    /** Viết tiếp thông báo vào mục thông báo */
    addNotification(message) {
      const timestamp = new Date().toLocaleTimeString();
      this.notifications.push({ message, timestamp });
      this.autoscroll(this.$refs.notificationContainer);
    },

    getWebWorkerResponse(messageType, messagePayload) {
      return new Promise((resolve, reject) => {
        // Tạo id tin nhắn ngẫu nhiên để xác định sự kiện tương ứng
        const messageId = Math.floor(Math.random() * 100000);

        // Gửi tin nhắn lên webworker
        this.cryptWorker.postMessage(
          [messageType, messageId].concat(messagePayload)
        );

        // Tạo trình xử lý sự kiện thông báo của webworker 
        const handler = function (e) {
          // Chỉ xử lý tin nhắn khớp với id
          if (e.data[0] === messageId) {
            // Loại bỏ sự kiện nghe mỗi khi listener được gọi.
            e.currentTarget.removeEventListener(e.type, handler);

            resolve(e.data[1]);
          }
        };

        // Chỉ định trình xử lý cho sự kiện 'thông báo' của webworker.
        this.cryptWorker.addEventListener("message", handler);
      });
    },

    /** Thông báo khóa công khai cho tất cả thành viên trong phòng */
    sendPublicKey() {
      if (this.originPublicKey) {
        this.socket.emit("PUBLIC_KEY", this.originPublicKey);
      }
    },

    getKeySnippet(key) {
      return key.slice(400, 416);
    },

    autoscroll(element) {
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    },
  },
});
