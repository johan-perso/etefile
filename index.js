// Importer des librairies
var fetch = require('node-fetch')
require('dotenv').config();

// Initialiser Firebase
var { initializeApp } = require("firebase/app");
const { getStorage, ref, deleteObject, listAll, uploadBytes, getDownloadURL } = require("firebase/storage");
const { collection, getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc } = require("firebase/firestore");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");

// Configuration et initialisation
const firebaseConfig = {
	apiKey: process.env.FIREBASE_API_KEY,
	authDomain: process.env.FIREBASE_AUTH_DOMAIN,
	databaseURL: process.env.FIREBASE_DATABASE_URL,
	projectId: process.env.FIREBASE_ID_PROJECT,
	storageBucket: process.env.FIREBASE_STORAGE_BUCKET
}
initializeApp(firebaseConfig);
const storage = getStorage();

// Se connecter à l'utilisateur admin
const auth = getAuth(); signInWithEmailAndPassword(auth, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD)
.then((userCredential) => {
	const user = userCredential.user;
	const server = app.listen(process.env.PORT || process.env.ETEFILE_PORT || 3000, () => { console.log(`Serveur web démarré sur le port ${server.address().port}`) })
	console.log(`Connecté à l'utilisateur admin : ${user.email}`)
	checkExpiredFiles()
})
.catch((error) => {
	console.log(`Impossible de se connecter à Firebase avec les informations administrateurs`)
	console.error(error)
	process.exit(1)
});

// Préparer un serveur web avec express.js
const express = require('express');
const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use(require('cors')());

// Rate limit
// Note : les rates limits ne s'appliquent pas à Firebase
app.use(require('express-rate-limit')({
	windowMs: 60 * 1000, // 1 minute
	max: process.env.ETEFILE_MAX_REQUESTS_BEFORE_RATE_LIMIT || 150,
	standardHeaders: true
}))

// Fonction pour formatter du JSON
function formatJSON(json){
	return JSON.stringify(json, null, 2)
}

// Génerer du texte aléatoirement (https://stackoverflow.com/a/1349426)
function generateText(length, charactersList) {
	var result           = [];
	var characters       = charactersList || process.env.ETEFILE_CODE_CHARLIST || 'ABCDEFGHJKLMoprstuvxyz012345679';
	var charactersLength = characters.length;
	for ( var i = 0; i < length; i++ ) {
		result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
	}
	return result.join('');
}

// Fonction pour générer un identifiant aléatoire
async function generateId(){
	// Générer un code
	var code = generateText(process.env.ETEFILE_CODE_LENGTH || 6)

	// Vérifier que le code n'a pas été utilisé
	const docRef = doc(getFirestore(), "filesList", code);
	const docSnap = await getDoc(docRef);

	// Si le code est déjà utilisé, en générer un nouveau
	if(docSnap.exists()) return generateId()

	// Sinon, retourner le code
	else return code
}

// Fonction pour obtenir les infos d'un compte
async function getAccount(email, password){
	var accountInfo = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`, {
		method: 'POST',
		body: JSON.stringify({
			returnSecureToken: true,
			email: email,
			password: password
		})
	}).then(res => res.json())
	return accountInfo
}

// Fonction pour obtenir les informations d'un compte à partir de son idToken
async function getAccountFromIdToken(idToken){
	var accountInfo = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`, {
		method: 'POST',
		body: JSON.stringify({
			idToken: idToken
		})
	}).then(res => res.json())
	return accountInfo?.users?.[0] || accountInfo
}

// Fonction pour vérifier si un fichier existe ou non
async function checkFileExists(filePath){
	var isFileExist;
	try {
		isFileExist = await getDownloadURL(ref(storage, filePath))
	} catch(e) {
		isFileExist = false
	}
	return isFileExist
}

// Vérifier chaque demi-jour que des fichiers n'ont pas expirés
setInterval(checkExpiredFiles, 1000 * 60 * 60 * 12)

// Vérifier qu'aucun fichiers soit expiré
var lastCheckForExpired;
async function checkExpiredFiles(){
	// Si la dernière vérification a été fait il y a moins de 30 minutes, annuler
	if(lastCheckForExpired && lastCheckForExpired > Date.now() - 1800000) return

	// Définir la variable pour la date de dernière vérification
	lastCheckForExpired = new Date()

	// Récupérer la liste des fichiers
	const allDatabaseFiles = await getDocs(collection(getFirestore(), "filesList"));

	// Obtenir tout les fichiers de Storage
	var allStorageFiles = await listAll(ref(storage, "etefile"))
	var simplifiedStoragesFiles = []
	allStorageFiles.items.forEach((file) => {})
	for(var i = 0; i < allStorageFiles.items.length; i++){
		simplifiedStoragesFiles.push(allStorageFiles.items[i])
	}
	for(var i = 0; i < allStorageFiles.prefixes.length; i++){
		var folderFiles = await listAll(ref(storage, allStorageFiles.prefixes[i]))
		for(var j = 0; j < folderFiles.items.length; j++){
			simplifiedStoragesFiles.push(folderFiles.items[j])
		}
	}

	// Log
	console.log(`Vérification des fichiers commencée`)

	// Préparer un array qui contiendra la liste des élements restants dans la BDD
	var remainingDatabaseFiles = []

	// Vérifier les fichier expirés dans la base de données
	allDatabaseFiles.forEach((doc) => {
		// Si le fichier est expiré
		if(Date.now() > new Date(doc.data().expire.seconds * 1000)){
			// Log
			console.log(`Le fichier ${doc.id} a expiré`)

			// Supprimer le fichier de la BDD
			deleteDoc(doc.ref)

			// Si un fichier existe dans Storage, le supprimer
			deleteObject(ref(storage, doc.data().filePath))
			.then(() => { console.log(`Le fichier ${doc.id} a été supprimé de Storage`) })
			.catch((error) => { console.log(`Impossible de supprimer le fichier ${doc.id} de Storage (peut être pas uploadé?)`) })
		} else {
			console.log(`Le fichier ${doc.id} N'EST PAS expiré`)
			remainingDatabaseFiles.push(doc)
		}
	})

	// Si le fichier est dans la BDD, mais pas dans Storage
	remainingDatabaseFiles.forEach(async doc => {
		// Obtenir le fichier dans Storage (récursivement)
		var tempFilePath = simplifiedStoragesFiles.find(prefix => prefix.fullPath == doc.data().filePath)

		// Si le fichier est introuvable dans Storage
		if(!tempFilePath){
			// Si le fichier n'a pas été créé il y a plus de 12 heures
			if(Date.now() < new Date(doc.data().created.seconds * 1000) + 1000 * 60 * 60 * 12) return

			// Log
			console.log(`Le fichier ${doc.id} est introuvable dans Storage`)

			// Supprimer le fichier de la BDD
			deleteDoc(doc.ref)
			.then(() => { console.log(`Le fichier ${doc.id} a été supprimé de la base de données`) })
			.catch((error) => { console.log(`Impossible de supprimer le fichier ${doc.id} de la base de données`) })
		}
	})
};

// Route - se connecter
app.post('/accounts/login', async (req, res) => {
	// Récupérer certaines informations
	var email = req.body.email;
	var password = req.body.password;

	// Vérifier que l'email et le mot de passe sont corrects
	if(!email || !password) return res.status(400).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'email/password manquant' }))

	// Obtenir le compte
	var account = await getAccount(email, password);
	if(!account?.idToken) return res.status(401).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'User does not exist.' }))

	// Retourner les informations
	res.set('Content-Type', 'application/json').send(formatJSON({ error: false, token: account?.idToken, userId: account?.localId, email: account?.email, expiresIn: account?.expiresIn}))
})

// Route - obtenir les fichiers uploadés
app.all('/accounts/:id/files', async (req, res) => {
	// Récupérer les informations d'authentification
	var email = req.body.email;
	var password = req.body.password;
	var idToken = req.headers.authorization;
	if(idToken) idToken = idToken.replace('Basic ','')

	// Vérifier l'authentification
	if(process.env.ETEFILE_CONNECTION_REQUIRED_TO_UPLOAD != "false" && !idToken && !email && !password) return res.status(400).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'email/password ou headers manquant' }))
	if(process.env.ETEFILE_CONNECTION_REQUIRED_TO_UPLOAD != "false" && !email && password) return res.status(400).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'email manquant' }))
	if(process.env.ETEFILE_CONNECTION_REQUIRED_TO_UPLOAD != "false" && email && !password) return res.status(400).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'password manquant' }))

	// Si aucune information n'est donnée, on utilise le fichier .env (uniquement si la connexion est pas requise)
	if(process.env.ETEFILE_CONNECTION_REQUIRED_TO_UPLOAD == "false" && (!email && !password) || !idToken) email = process.env.USER_EMAIL

	// Vérifier l'idToken
	var account;
	if(idToken){
		var account = await getAccountFromIdToken(idToken);
		if(!account?.localId) return res.status(401).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'User does not exist.' }))
	}

	// Vérifier l'adresse mail/mdp
	if(!account) account = (await getAccount(email, password));
	if(!account?.localId) return res.status(401).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'User does not exist.' }))

	// Obtenir la liste des fichiers
	var simplifiedListFiles = []
	var files = await getDocs(collection(getFirestore(), "filesList"));
	files.forEach(doc => {
		if(doc.data().owner == account?.localId) simplifiedListFiles.push({
			hiberfileId: doc.id,
			filename: doc.data().filename,
			expire: new Date(doc.data().expire.seconds * 1000),
			downloadUrl: doc.data().downloadUrl,
		})
	})

	// Retourner les informations
	res.set('Content-Type', 'application/json').send(formatJSON({ error: false, files: simplifiedListFiles }))
})
// TODO: test le site hiberfile en utilisant l'option pour utiliser etefile sans compte
// Route - obtenir les webhooks
app.get('/accounts/:id/webhooks', async (req, res) => {
	// TODO: implémenter cette feature
	res.set('Content-Type', 'application/json').send(formatJSON({ error: false, webhooks: { newFileUploading: '', newFileUploaded: '', newFileDownloading: '' } }))
})

// Route - créé un fichier dans la BDD
app.post('/files/create', async (req, res) => {
	// Récupérer certaines informations
	var fileName = req.body.name;
	var expireDate = req.body.expire;
	var email = req.body.email;
	var password = req.body.password;

	// Ou authentification par idToken
	var idToken = req.headers.authorization;
	if(idToken) idToken = idToken.replace('Basic ','')

	// Vérifier la date d'expiration
	if(expireDate == null) expireDate = new Date(Date.now() + 1000 * 60 * 60 * 24)
	else expireDate = new Date(Date.now() + 1000 * expireDate)

	// Vérifier que le nom du fichier soit donné
	if(!fileName) return res.status(400).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'name manquant' }))

	// Vérifier l'authentification
	if(process.env.ETEFILE_CONNECTION_REQUIRED_TO_UPLOAD != "false" && !idToken && !email && !password) return res.status(400).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'email/password ou headers manquant' }))
	if(process.env.ETEFILE_CONNECTION_REQUIRED_TO_UPLOAD != "false" && !email && password) return res.status(400).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'email manquant' }))
	if(process.env.ETEFILE_CONNECTION_REQUIRED_TO_UPLOAD != "false" && email && !password) return res.status(400).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'password manquant' }))

	// Si aucune information n'est donnée, on utilise le fichier .env (uniquement si la connexion est pas requise)
	if(process.env.ETEFILE_CONNECTION_REQUIRED_TO_UPLOAD == "false" && (!email && !password) || !idToken) email = process.env.USER_EMAIL

	// Vérifier l'idToken
	var account;
	if(idToken){
		var account = await getAccountFromIdToken(idToken);
		if(!account?.localId) return res.status(401).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'User does not exist.' }))
	}

	// Vérifier l'adresse mail/mdp
	if(!account) account = (await getAccount(email, password));
	if(!account?.localId) return res.status(401).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'User does not exist.' }))

	// Générer un code identifiant unique
	var uniqueId = await generateId()

	// Modifier le nom du fichier
	fileName = fileName.replace(/ /g, '-').replace(/\\\//g, '-').replace(/\//g, '-').substring(0, 64)

	// Préparer la variable qui contiendra le chemin du fichier
	var filePath = `etefile/${encodeURIComponent(fileName)}`

	// Si un fichier existe déjà avec ce nom dans Storage, modifier le filePath
	if(await checkFileExists(filePath)) filePath = `etefile/${uniqueId}/${encodeURIComponent(fileName)}`

	// Ajouter le fichier dans la BDD
	await setDoc(doc(collection(getFirestore(), "filesList"), uniqueId), {
		filename: fileName,
		downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${process.env.FIREBASE_STORAGE_BUCKET}/o/${filePath}?alt=media`,
		expire: expireDate,
		created: new Date(),
		owner: account?.localId,
		filePath: filePath
	});

	// Créer un fichier vierge dans Storage avec une certaine métadonnée à l'emplacement
	await uploadBytes(ref(storage, filePath), new Uint8Array([1]), { customMetadata: { uploaded: false } });

	// Générer un lien pour le fichier
	res.set('Content-Type', 'application/json').send(formatJSON({
		uploadUrls: [`https://firebasestorage.googleapis.com/v0/b/${process.env.FIREBASE_STORAGE_BUCKET}/o?name=${filePath}`],
		authorization: `Firebase ${account?.idToken || idToken}`,
		uniqueId: uniqueId,
		hiberfileId: uniqueId,
		expire: expireDate,
		created: new Date()
	}))

	// Vérifier les fichiers expirés
	checkExpiredFiles()
})

// Route - récupérer des informations sur un fichier
app.get('/files/:id', async (req, res) => {
	// Récupérer le code identifiant du fichier
	var id = req.params.id;

	// Vérifier le code identifiant
	if(!id) return res.status(400).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'id manquant' }))

	// Obtenir le fichier de la BDD
	const docRef = doc(getFirestore(), "filesList", id);
	const docSnap = await getDoc(docRef);

	// Si le fichier n'existe pas, retourner une erreur
	if(!docSnap.exists()) return res.status(404).set('Content-Type', 'application/json').send(formatJSON({ error: true, message: 'fichier introuvable' }))

	// Sinon, retourner les informations du fichier
	else res.set('Content-Type', 'application/json').send(formatJSON({
		error: false,
		created: new Date(docSnap.data().created.seconds * 1000),
		expire: new Date(docSnap.data().expire.seconds * 1000),
		filename: docSnap.data().filename,
		downloadUrl: docSnap.data().downloadUrl
	}))
})

// Routes - erreur 404
app.get('*', async (req, res) => {
	res.set('Content-Type', 'application/json').send(formatJSON({ error: true, message: "Route non trouvé" }))
})
app.post('*', async (req, res) => {
	res.set('Content-Type', 'application/json').send(formatJSON({ error: true, message: "Route non trouvé" }))
})
