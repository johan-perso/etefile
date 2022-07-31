// Importer des librairies
var fetch = require('node-fetch')
require('dotenv').config();

// Initialiser Firebase
var { initializeApp } = require("firebase/app");
const { getStorage, ref, deleteObject, listAll } = require("firebase/storage");
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

// Rate limit
// Note : les rates limits ne s'appliquent pas à Firebase
app.use(require('express-rate-limit')({
	windowMs: 60 * 1000, // 1 minute
	max: process.env.ETEFILE_MAX_REQUESTS_BEFORE_RATE_LIMIT,
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
	var code = generateText(process.env.ETEFILE_CODE_LENGTH || 8)

	// Vérifier que le code n'a pas été utilisé
	const docRef = doc(getFirestore(), "filesList", code);
	const docSnap = await getDoc(docRef);

	// Si le code est déjà utilisé, en générer un nouveau
	if (docSnap.exists()) return generateId()

	// Sinon, retourner le code
	else return code
}

// Fonction pour obtenir un idToken
async function getIdToken(email, password){
	var accountInfo = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`, {
		method: 'POST',
		body: JSON.stringify({
			returnSecureToken: true,
			email: email,
			password: password
		})
	}).then(res => res.json())
	return accountInfo.idToken
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

	// Log
	console.log(`Vérification des fichiers commencée`)

	// Préparer un array qui contiendra la liste des élements restants dans la BDD
	var remainingDatabaseFiles = []

	// Si la liste est vide, retourner
	allDatabaseFiles.forEach((doc) => {
		// Si le fichier est expiré
		if(Date.now() > new Date(doc.data().expire.seconds * 1000)){
			// Log
			console.log(`Le fichier ${doc.id} a expiré`)

			// Supprimer le fichier de la BDD
			deleteDoc(doc.ref)

			// Si un fichier existe dans Storage, le supprimer
			deleteObject(ref(storage, `etefile/${doc.id}`))
			.then(() => { console.log(`Le fichier ${doc.id} a été supprimé de Storage`) })
			.catch((error) => { console.log(`Impossible de supprimer le fichier ${doc.id} de Storage (peut être pas uploadé?)`) })
		} else {
			console.log(`Le fichier ${doc.id} N'EST PAS expiré`)
			remainingDatabaseFiles.push(doc)
		}
	})

	// Si le fichier est dans Storage, mais pas la BDD
	var allStorageFiles = await listAll(ref(storage, "etefile"))
	allStorageFiles.items.forEach(file => {
		// Si le fichier est introuvable dans la base de données
		if(!remainingDatabaseFiles.some(doc => doc.id == file.name)){
			// Log
			console.log(`Le fichier ${file.name} est introuvable dans la base de données`)

			// Supprimer le fichier de Storage
			deleteObject(file)
			.then(() => { console.log(`Le fichier ${file.name} a été supprimé de Storage`) })
			.catch((error) => { console.log(`Impossible de supprimer le fichier ${file.name} de Storage`) })
		}
	})

	// Si le fichier est dans la BDD, mais pas dans Storage
	remainingDatabaseFiles.forEach(doc => {
		// Si le fichier est introuvable dans Storage
		if(!allStorageFiles.items.some(file => file.name == doc.id)){
			// Si le fichier n'a pas été créé il y a plus d'une heure
			if(Date.now() < new Date(doc.data().created.seconds * 1000 + 3600000)) return

			// Log
			console.log(`Le fichier ${doc.id} est introuvable dans Storage`)

			// Supprimer le fichier de la BDD
			deleteDoc(doc.ref)
			.then(() => { console.log(`Le fichier ${doc.id} a été supprimé de la base de données`) })
			.catch((error) => { console.log(`Impossible de supprimer le fichier ${doc.id} de la base de données`) })
		}
	})
};

// Route - créé un fichier dans la BDD
app.post('/files/create', async (req, res) => {
	// Récupérer certaines informations
	var fileName = req.body.name;
	var expireDate = req.body.expire;
	var email = req.body.email;
	var password = req.body.password;

	// Vérifier la date d'expiration
	if(expireDate == null) expireDate = new Date(Date.now() + 1000 * 60 * 60 * 24)
	else expireDate = new Date(Date.now() + 1000 * expireDate)

	// Vérifier les informations
	if(!fileName) return res.status(400).set('Content-Type', 'text/plain').send(formatJSON({ error: true, message: 'name manquant' }))
	if(process.env.ETEFILE_CONNECTION_REQUIRED_TO_UPLOAD != "false" && (!email || !password)) return res.status(400).set('Content-Type', 'text/plain').send(formatJSON({ error: true, message: 'email/password manquant' }))

	// Si l'email ou le mot de passe n'est pas donné, utiliser les informations du fichier .env
	if(process.env.ETEFILE_CONNECTION_REQUIRED_TO_UPLOAD == "false" && !email?.length) email = process.env.USER_EMAIL
	if(process.env.ETEFILE_CONNECTION_REQUIRED_TO_UPLOAD == "false" && !password?.length) password = process.env.USER_PASSWORD

	// Obtenir l'idToken
	var idToken = await getIdToken(email, password);
	if(!idToken) return res.status(401).set('Content-Type', 'text/plain').send(formatJSON({ error: true, message: 'Authentification incorrecte' }))

	// Générer un code identifiant unique
	var uniqueId = await generateId()

	// Ajouter le fichier dans la BDD
	await setDoc(doc(collection(getFirestore(), "filesList"), uniqueId), {
		filename: fileName,
		downloadUrl: `https://firebasestorage.googleapis.com/v0/b/${process.env.FIREBASE_STORAGE_BUCKET}/o/etefile%2F${encodeURIComponent(uniqueId)}?alt=media`,
		expire: expireDate,
		created: new Date()
	});

	// Générer un lien pour le fichier
	res.set('Content-Type', 'application/json').send(formatJSON({
		uploadUrls: [`https://firebasestorage.googleapis.com/v0/b/${process.env.FIREBASE_STORAGE_BUCKET}/o?name=etefile/${encodeURIComponent(uniqueId)}`],
		authorization: `Firebase ${idToken}`,
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
	if(!id) return res.status(400).set('Content-Type', 'text/plain').send(formatJSON({ error: true, message: 'id manquant' }))

	// Obtenir le fichier de la BDD
	const docRef = doc(getFirestore(), "filesList", id);
	const docSnap = await getDoc(docRef);

	// Si le fichier n'existe pas, retourner une erreur
	if(!docSnap.exists()) return res.status(404).set('Content-Type', 'text/plain').send(formatJSON({ error: true, message: 'fichier introuvable' }))

	// Sinon, retourner les informations du fichier
	else res.set('Content-Type', 'application/json').send(formatJSON(docSnap.data()))
})

// Routes - erreur 404
app.get('*', async (req, res) => {
	res.set('Content-Type', 'application/json').send(formatJSON({ error: true, message: "Route non trouvé" }))
})
app.post('*', async (req, res) => {
	res.set('Content-Type', 'application/json').send(formatJSON({ error: true, message: "Route non trouvé" }))
})

// Démarrer le serveur web
const server = app.listen(process.env.PORT || process.env.ETEFILE_PORT || 3000, () => {
    console.log(`Serveur web démarré sur le port ${server.address().port}`);
});
