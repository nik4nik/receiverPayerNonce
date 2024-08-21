import "dotenv/config";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Keypair,
} from '@solana/web3.js';

import {
  AccountLayout,
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';

function getKeyPair(n) {
	let key = process.env["SECRET_KEY" + n];
	if (key !== undefined)
		return Keypair.fromSecretKey(
			Uint8Array.from(
				JSON.parse(key)));
	console.log(`Add SECRET_KEY${n} to .env!`);
	process.exit(1);
}

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

const sender = getKeyPair(1);
const recipient = getKeyPair(2);

// Адрес токена
const tokenMintAddress = new PublicKey('GLCkK1D5aKAaeeQSLRXHLzdWrrkmad2rJXBD3A5mWTis');

// Nonce аккаунт
const nonceAccountPublicKey = new PublicKey('3dAQDH5bxCzukAuwzkjvy3g3jzY7BeJzVGbwMDuMRA59');
const nonceAuthority = getKeyPair("nonceAuthority");; // Ключ пары, управляющей Nonce аккаунтом

async function main() {
  // Создаем ассоциированный токеновый аккаунт для отправителя, если его еще нет
  const senderTokenAccount = await getOrCreateAssociatedTokenAccount(
	connection,
	sender,
	tokenMintAddress,
	sender.publicKey
  );

  // Создаем ассоциированный токеновый аккаунт для получателя, если его еще нет
  const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
	connection,
	sender,
	tokenMintAddress,
	recipient.publicKey
  );

  // Получаем текущий Durable Nonce
  const nonceAccountInfo = await connection.getAccountInfo(nonceAccountPublicKey);
  const nonce = (nonceAccountInfo && nonceAccountInfo.data) ? nonceAccountInfo.data.slice(0, 8) : null;

  if (!nonce) {
	throw new Error('Failed to retrieve nonce');
  }

  // Mint 1 new token to the "senderTokenAccount" account we just created
  let signatureMinting = await mintTo(
	connection,
	sender,
	tokenMintAddress,
	senderTokenAccount.address,
	sender.publicKey,
	1000000000
  );
console.log('mint tx:', signatureMinting);

  // Создаем инструкцию перевода токенов
  const transferInstruction = createTransferInstruction(
	senderTokenAccount.address, // Адрес отправителя токенов
	recipientTokenAccount.address, // Адрес получателя токенов
	sender.publicKey, // Отправитель
	1000000, // Количество токенов для перевода (например, 1 токен = 1000000 micro-tokens)
	[sender,
	 recipient,
	 nonceAuthority,
	], // Необходимые подписи
	TOKEN_PROGRAM_ID
  );

  // Создаем транзакцию
  //let transaction = new Transaction().add(transferInstruction);

  // Создаем транзакцию с использованием Durable Nonce
  let transaction = new Transaction({
	feePayer: sender.publicKey,
	recentBlockhash: nonce.toString('base64'), // Используем Durable Nonce как recentBlockhash
  }).add(
	// Инструкция для получения нового Nonce и обновления nonce аккаунта
	SystemProgram.nonceAdvance({
	  noncePubkey: nonceAccountPublicKey,
	  authorizedPubkey: nonceAuthority.publicKey,
	}),
	transferInstruction
  );

  console.log("Wait for 3 minutes");
	setTimeout(async () => {
	  // Получатель оплачивает комиссию
	  const signature = await sendAndConfirmTransaction(
		connection,
		transaction,
		[sender,
		 recipient,
		 nonceAuthority,
		], // Подпись отправителя (получателя токенов)
		{
		  skipPreflight: false,
		  preflightCommitment: 'confirmed',
		  commitment: 'confirmed',
		}
	  );
	  console.log('Транзакция успешно выполнена:', signature);
  }, 3 * 60 * 1000);
}

main().catch(err => {
  console.error(err);
});
