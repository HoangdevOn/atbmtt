self.window = self // Yêu cầu thưu viện jsencrypt làm việc trong webworker

// Thêm thư viện jsencrypt
self.importScripts('https://cdnjs.cloudflare.com/ajax/libs/jsencrypt/2.3.1/jsencrypt.min.js');

let crypt = null
let privateKey = null

onmessage = function(e) {
  const [ messageType, messageId, text, key ] = e.data
  let result
  switch (messageType) {
    case 'generate-keys':
      result = generateKeypair()
      break
    case 'encrypt':
      result = encrypt(text, key)
      break
    case 'decrypt':
      result = decrypt(text)
      break
  }

  // Return result to the UI thread
  // Trả về luồng giao diện
  postMessage([ messageId, result ])
}

/** Khởi tạo và chứa các khóa */
function generateKeypair () {
  crypt = new JSEncrypt({default_key_size: 2056})
  privateKey = crypt.getPrivateKey()

  // Chỉ trả ra các khóa công khai, các khóa bí mật được giữa lại và giấu đi.
  return crypt.getPublicKey()
}

/** Mã hóa các chuỗi được cung cấp với khóa công khai của người nhận */
function encrypt (content, publicKey) {
  crypt.setKey(publicKey)
  return crypt.encrypt(content)
}

/** Giải mã các chuỗi được cung cấp với khóa bí mật */
function decrypt (content) {
  crypt.setKey(privateKey)
  return crypt.decrypt(content)
}
