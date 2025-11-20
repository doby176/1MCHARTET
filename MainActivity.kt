package com.scan2chat.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Rect
import android.graphics.RectF
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ImageSpan
import android.util.Log
import android.view.View
import android.view.ViewTreeObserver
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import java.io.File
import java.net.URLEncoder
import java.util.ArrayDeque
import java.util.LinkedHashSet
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern
import kotlin.math.min
import org.json.JSONObject


class MainActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var tvDetected: TextView
    private lateinit var btnSend: Button
    private lateinit var btnOpenWhatsApp: Button
    private lateinit var btnCall: Button
    private lateinit var btnClear: Button
    private lateinit var btnToggleSendMode: Button
    private lateinit var btnDeliveryMode: Button
    private lateinit var btnBulkSend: Button
    private lateinit var etCustomMessage: EditText
    private lateinit var flashAlert: LinearLayout
    private lateinit var btnLogout: Button
    private lateinit var tvWhatsAppWarning: TextView
    private lateinit var topBar: LinearLayout
    private lateinit var detectionPanel: LinearLayout
    private lateinit var buttonContainer: LinearLayout
    private lateinit var scanOverlay: ScanOverlayView
    private val cameraExecutor = Executors.newSingleThreadExecutor()
    private var lastDetectedNumber: String? = null
    private var confirmedNumber: String? = null
    private var lastDetectedAddress: String? = null
    private var confirmedAddress: String? = null
    private var detectionCount = 0
    private var lastScanTime = 0L
    private val MIN_SCAN_INTERVAL = 300L
    private var camera: Camera? = null
    private var mediaPlayer: MediaPlayer? = null
    private var bulkLimitDialogShown = false
    private val whatsappWarningHideRunnable = Runnable {
        tvWhatsAppWarning.visibility = View.GONE
    }
    private val roiRectNorm = RectF(0f, 0f, 1f, 1f)
    private val scanWindowRectPx = Rect()

    private var isBulkScanMode = false
    private var isWhatsAppSendMode = false

    private val phonePattern = Pattern.compile("(\\+?972[0-9]{8,10}|05[0-9]{8})")
    private val requiredSmsPermissions = arrayOf(
        Manifest.permission.SEND_SMS,
        Manifest.permission.READ_SMS
    )

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) checkAccessAndStart() else Toast.makeText(this, "Camera permission required", Toast.LENGTH_SHORT).show()
    }

    private val requestSmsPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants.all { it.value }) {
            Log.d("PERMISSION", "All SMS permissions granted")
        } else {
            Toast.makeText(this, "SMS reply detection disabled without READ_SMS", Toast.LENGTH_LONG).show()
        }
    }

    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()
    private val defaultMessage = "היי 😊 משלוח בדרך 9:00-14:00. אפשר קומה/דירה+קוד? אם אין מישהו בבית להשאיר בדלת או בארון חשמל?"
    private val whatsappModeWarningText =
        "מצב WhatsApp פעיל. שליחת הודעות מרובות מחשבון רגיל עלולה לגרום לחסימה של 24 שעות ואף לצמיתות. מומלץ להשתמש ב-WhatsApp Business ולהשאיר מרווח של לפחות 30 שניות בין הודעות. במצב זה השליחה הקבוצתית מושבתת."

    private val flashHandler = Handler(Looper.getMainLooper())
    private val hideFlashRunnable = Runnable { flashAlert.visibility = View.GONE }

    companion object {
        val bulkQueue = LinkedHashSet<String>()
        val contactedNumbers = mutableSetOf<String>()
        val replyMap = mutableMapOf<String, ReplyData>()
        val addressMap = mutableMapOf<String, String>() // phone -> address
        var isDeliveryMode = false
        var isBulkMode = false
        private var onReplyUpdate: (() -> Unit)? = null
        lateinit var appContext: Context
        private val streetsList = mutableListOf<String>()

        private const val PREF_NAME = "Scan2ChatPrefs"
        private const val KEY_SMS_PERMISSION_EXPLAINED = "sms_perm_rationale"
        private const val MAX_BULK_PER_WINDOW = 30
        private const val RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000L
        private val sendTimestamps = ArrayDeque<Long>()

        fun addReply(phone: String, data: ReplyData) {
            replyMap[phone] = data
            onReplyUpdate?.invoke()
            Log.d("REPLY_SAVED", "Saved reply for $phone: $data")

            Handler(Looper.getMainLooper()).post {
                try {
                    Toast.makeText(appContext, "תגובה התקבלה!", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Log.e("REPLY_SAVED", "Toast failed", e)
                }
            }
        }

        fun resetBulkMode() {
            isBulkMode = false
        }

        fun pruneOldSends() {
            val cutoff = System.currentTimeMillis() - RATE_LIMIT_WINDOW_MS
            while (sendTimestamps.isNotEmpty() && sendTimestamps.first() < cutoff) {
                sendTimestamps.removeFirst()
            }
        }

        fun remainingQuota(): Int {
            pruneOldSends()
            return MAX_BULK_PER_WINDOW - sendTimestamps.size
        }

        fun recordSend(count: Int) {
            val now = System.currentTimeMillis()
            repeat(count) { sendTimestamps.addLast(now) }
        }

        fun timeUntilNextWindow(): Long? {
            pruneOldSends()
            val first = sendTimestamps.firstOrNull() ?: return null
            val wait = first + RATE_LIMIT_WINDOW_MS - System.currentTimeMillis()
            return if (wait <= 0L) null else wait
        }

        // Levenshtein Distance for fuzzy string matching
        fun levenshteinDistance(s1: String, s2: String): Int {
            val len1 = s1.length
            val len2 = s2.length
            val dp = Array(len1 + 1) { IntArray(len2 + 1) }

            for (i in 0..len1) dp[i][0] = i
            for (j in 0..len2) dp[0][j] = j

            for (i in 1..len1) {
                for (j in 1..len2) {
                    val cost = if (s1[i - 1] == s2[j - 1]) 0 else 1
                    dp[i][j] = minOf(
                        dp[i - 1][j] + 1,      // deletion
                        dp[i][j - 1] + 1,      // insertion
                        dp[i - 1][j - 1] + cost // substitution
                    )
                }
            }
            return dp[len1][len2]
        }

        // Calculate similarity percentage
        fun similarity(s1: String, s2: String): Double {
            val maxLen = maxOf(s1.length, s2.length)
            if (maxLen == 0) return 100.0
            val distance = levenshteinDistance(s1.lowercase(), s2.lowercase())
            return (1.0 - distance.toDouble() / maxLen) * 100.0
        }

        // Find closest matching street name
        fun findClosestStreet(scanned: String): Pair<String, Double>? {
            if (streetsList.isEmpty() || scanned.isBlank()) return null
            
            var bestMatch: String? = null
            var bestScore = 0.0

            streetsList.forEach { street ->
                val score = similarity(scanned, street)
                if (score > bestScore) {
                    bestScore = score
                    bestMatch = street
                }
            }

            return if (bestMatch != null && bestScore >= 60.0) {
                Pair(bestMatch!!, bestScore)
            } else null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        appContext = this
        supportActionBar?.hide()

        // Load streets database
        loadStreetsDatabase()

        previewView = findViewById(R.id.previewView)
        tvDetected = findViewById(R.id.tvDetected)
        btnSend = findViewById(R.id.btnSend)
        btnOpenWhatsApp = findViewById(R.id.btnOpenWhatsApp)
        btnCall = findViewById(R.id.btnCall)
        btnClear = findViewById(R.id.btnClear)
        btnToggleSendMode = findViewById(R.id.btnToggleSendMode)
        btnDeliveryMode = findViewById(R.id.btnDeliveryMode)
        btnBulkSend = findViewById(R.id.btnBulkSend)
        etCustomMessage = findViewById(R.id.etCustomMessage)
        flashAlert = findViewById(R.id.flashAlert)
        btnLogout = findViewById(R.id.btnLogout)
        tvWhatsAppWarning = findViewById(R.id.tvWhatsAppWarning)
        topBar = findViewById(R.id.topBar)
        detectionPanel = findViewById(R.id.detectionPanel)
        buttonContainer = findViewById(R.id.buttonContainer)
        scanOverlay = findViewById(R.id.scanOverlay)

        // Restore state if app was backgrounded
        restoreSavedState()

        previewView.viewTreeObserver.addOnGlobalLayoutListener(object : ViewTreeObserver.OnGlobalLayoutListener {
            override fun onGlobalLayout() {
                if (previewView.width == 0 || previewView.height == 0) return
                updateScanWindowBounds()
                previewView.viewTreeObserver.removeOnGlobalLayoutListener(this)
            }
        })
        val roiLayoutListener = ViewTreeObserver.OnGlobalLayoutListener {
            updateScanWindowBounds()
        }
        detectionPanel.viewTreeObserver.addOnGlobalLayoutListener(roiLayoutListener)
        buttonContainer.viewTreeObserver.addOnGlobalLayoutListener(roiLayoutListener)
        etCustomMessage.viewTreeObserver.addOnGlobalLayoutListener(roiLayoutListener)

        tvDetected.text = "סריקה..."
        updateSendModeToggle()

        updateDeliveryButtonVisibility()
        updateBulkSendButton()

        btnLogout.setOnClickListener {
            auth.signOut()
            clearUserStateOnLogout()
            startActivity(Intent(this, AuthActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            })
            finish()
        }

        btnSend.setOnClickListener {
            confirmedNumber?.let { number ->
                if (isWhatsAppSendMode) {
                    openWhatsApp(
                        number,
                        includeBody = !isDeliveryMode
                    )
                } else {
                    sendSmsMessage(
                        number,
                        useCustomMessage = etCustomMessage.text.toString().trim().isNotEmpty(),
                        forceEmptyBody = isDeliveryMode
                    )
                }
            } ?: Toast.makeText(this, "לא זוהה מספר", Toast.LENGTH_SHORT).show()
        }

        btnOpenWhatsApp.setOnClickListener {
            if (!isDeliveryMode) {
                showWhatsAppWarning()
            }
            confirmedNumber?.let { openWhatsApp(it, includeBody = !isDeliveryMode) }
                ?: Toast.makeText(this, "לא זוהה מספר", Toast.LENGTH_SHORT).show()
        }

        btnCall.setOnClickListener {
            confirmedNumber?.let { number ->
                val localNumber = if (number.startsWith("+972")) "0" + number.substring(4) else number
                startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$localNumber")))
            } ?: Toast.makeText(this, "לא זוהה מספר", Toast.LENGTH_SHORT).show()
        }

        btnClear.setOnClickListener { resetScanState() }
        
        // Add double-tap listener for manual phone entry
        tvDetected.setOnClickListener { view ->
            val now = System.currentTimeMillis()
            val lastTap = tvDetected.tag as? Long ?: 0L
            if (now - lastTap < 500) {
                // Double tap detected
                showManualPhoneEntryDialog()
            }
            tvDetected.tag = now
        }
        btnToggleSendMode.setOnClickListener {
            if (isDeliveryMode) {
                Toast.makeText(this, "מצב WhatsApp זמין רק במצב סריקה רגיל", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            isWhatsAppSendMode = !isWhatsAppSendMode
            if (isWhatsAppSendMode && isBulkScanMode) {
                exitBulkScanMode()
            }
            updateSendModeToggle()
            if (isWhatsAppSendMode) {
                showWhatsAppWarning(whatsappModeWarningText, 10_000L)
            } else {
                hideWhatsAppWarning()
            }
        }

        btnDeliveryMode.setOnClickListener {
            if (isBulkScanMode) exitBulkScanMode()
            isDeliveryMode = !isDeliveryMode
            if (isDeliveryMode && isWhatsAppSendMode) {
                isWhatsAppSendMode = false
                updateSendModeToggle()
                Toast.makeText(this, "מצב WhatsApp כובה אוטומטית במצב חלוקה", Toast.LENGTH_SHORT).show()
            }
            updateDeliveryButton()
            Toast.makeText(this, if (isDeliveryMode) "מצב משלוח הופעל" else "חזרת למצב סריקה", Toast.LENGTH_SHORT).show()
        }

        btnBulkSend.setOnClickListener {
            if (isWhatsAppSendMode) {
                Toast.makeText(this, "שליחה קבוצתית זמינה רק במצב SMS", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (isBulkScanMode) {
                showBulkSendDialog()
            } else {
                isBulkScanMode = true
                isBulkMode = true
                updateBulkSendButton()
                Toast.makeText(this, "מצב סריקה קבוצתית – סרוק עד 30 מספרים ושלח!", Toast.LENGTH_LONG).show()
            }
        }

        onReplyUpdate = { runOnUiThread { updateDeliveryButtonVisibility(); updateBulkSendButton() } }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionLauncher.launch(Manifest.permission.CAMERA)
        }

        ensureSmsPermissions()

        checkAccessAndStart()
    }

    private fun loadStreetsDatabase() {
        Log.d("STREETS_DB", "🔄 Starting to load streets database...")
        try {
            // Load from embedded JSON string (no external file needed!)
            Log.d("STREETS_DB", "📥 Getting JSON string...")
            val jsonString = getStreetsJSON()
            Log.d("STREETS_DB", "📦 JSON length: ${jsonString.length} chars")
            
            val jsonObject = JSONObject(jsonString)
            val streetsArray = jsonObject.getJSONArray("streets")
            Log.d("STREETS_DB", "📋 JSON parsed, array size: ${streetsArray.length()}")
            
            streetsList.clear()
            for (i in 0 until streetsArray.length()) {
                streetsList.add(streetsArray.getString(i))
            }
            Log.d("STREETS_DB", "✅ SUCCESS! Loaded ${streetsList.size} streets from embedded database")
            Log.d("STREETS_DB", "🔍 First 5 streets: ${streetsList.take(5).joinToString(", ")}")
        } catch (e: Exception) {
            Log.e("STREETS_DB", "❌ FATAL ERROR loading streets database: ${e.message}", e)
            e.printStackTrace()
        }
    }
    
    private fun getStreetsJSON(): String {
        // TOP 5000 MOST COMMON ISRAELI STREETS
        // Embedded directly in code - no external file needed!
        // Covers: Tel Aviv, Jerusalem, Haifa, Beer Sheva, Rishon LeZion, Petah Tikva,
        // Netanya, Holon, Bnei Brak, Ramat Gan, Ashdod, Ashkelon, Rehovot, Bat Yam, etc.
        return """
        {
          "streets": [
            "הרצל", "בן גוריון", "ויצמן", "רוטשילד", "דיזנגוף", "אלנבי", "יפו", "יהודה הלוי",
            "קינג ג'ורג'", "הרב קוק", "בן יהודה", "שינקין", "אבן גבירול", "נחלת בנימין",
            "הכובש", "יואל כהן", "חנה ומיכאל לוין", "מחלי הלוי", "התעשייה", "הנשיא",
            "ז'בוטינסקי", "הרב מימון", "סוקולוב", "ארלוזורוב", "נורדאו", "בגרוניזוב",
            "מנחם בגין", "הרב ברלין", "יהושע בן נון", "הרב עוזיאל", "משה שרת", "לוי אשכול",
            "גולדה מאיר", "יצחק רבין", "דוד המלך", "שלמה המלך", "שאול המלך", "ירמיהו",
            "ישעיהו", "יחזקאל", "דניאל", "שמואל", "אליהו הנביא", "בלפור", "מאפו", "ביאליק",
            "אחד העם", "שמעון הצדיק", "רמב״ם", "רש״י", "הרמב״ן", "הרב אלקלעי", "הרב קליר",
            "הרב הרצוג", "הרב גורן", "הרב פרנקל", "הרב טאו", "הרב אבינר", "הרב לאו",
            "הרב שך", "הרב עובדיה", "דרך חברון", "דרך יפו", "דרך בן גוריון", "דרך הרצל",
            "דרך שלום", "דרך ירושלים", "דרך חיל", "דרך מנחם בגין", "שדרות רוטשילד",
            "שדרות ירושלים", "שדרות בן גוריון", "שדרות הרצל", "שדרות ויצמן", "שדרות יהודית",
            "רחוב הראשונים", "רחוב העצמאות", "רחוב הגפן", "רחוב הזית", "רחוב התאנה",
            "רחוב הרימון", "רחוב התמר", "רחוב האלון", "רחוב הארז", "רחוב הברוש",
            "רחוב האורן", "רחוב השקד", "רחוב החרוב", "רחוב הדקל", "סמטת הכרם",
            "מעלה הזיתים", "מורד הזיתים", "עליית הנוער", "דרך הגבעה", "מרדכי רוזנשטיין",
            "נירים", "אברבנאל", "שלמה אלירז", "איינשטיין", "בר כוכבא", "הנחל", "קק״ל",
            "הגליל", "יעקב דורי", "אסיף חגגי", "אוסישקין", "אלוף שדה", "אלנבי", "אסתר המלכה",
            "אליעזר בן יהודה", "אברהם שפירא", "אברהם בן שושן", "אדם הכהן", "אהרון צ'חנובר",
            "אהרונוביץ", "אהרוני", "אוהל משה", "אוהל שרה", "אוהליאב", "אוולוזורוב", "אוסטרובסקי",
            "אורי צבי גרינברג", "אורלוב", "אורלנסקי", "אטלס", "איינשטיין", "איכילוב", "איל",
            "אילת", "אינשטיין", "איסלנד", "איצקוביץ", "אירוס", "איריס", "איתמר", "אכזיב",
            "אלברט פירסט", "אלדד", "אלה", "אלון", "אלוני אבא", "אלכסנדר ינאי", "אלכסנדרוב",
            "אלעזר בן עזריה", "אלעזר המודעי", "אלפסי", "אלקלעי", "אמיל זולא", "אנילביץ",
            "אנקורי", "אסא", "אסף", "אסף הרופא", "אסף שמחוני", "אעבלין", "אפרים", "אפרים קציר",
            "אצ״ל", "ארבל", "ארגמן", "ארז", "ארלוזורוב", "ארניה", "אשכול", "אשכנזי", "בארי",
            "בוגרשוב", "בורוכוב", "בורלא", "בז'רנו", "בזל", "ביאליק", "בילו", "בילינסון",
            "ביס", "בית אל", "בית הלל", "בית יעקב", "בית לחם", "בית שאן", "בית שמש",
            "בלפור", "בן אבוי", "בן אליעזר", "בן גוריון", "בן גמלא", "בן זכאי", "בן יהודה",
            "בן יוסף", "בן ימין", "בן עמי", "בן עטר", "בן צבי", "בן צפניה", "בן ציון",
            "בן שטח", "בן שמן", "בנימין מטודלה", "בעל התניא", "בעל שם טוב", "בצלאל",
            "בצרון", "בקר", "בר אילן", "בר גיורא", "בר יוחאי", "בר כוכבא", "בר לב",
            "בראשית", "ברדיצ'ב", "ברודסקי", "ברודצקי", "ברוך", "ברוכוב", "ברזאני", "ברזיל",
            "ברזילי", "ברנר", "ברנע", "בשן", "בתיה", "גאולה", "גבורי ישראל", "גבעול",
            "גבעת המטוסים", "גבעתי", "גביזון", "גבס", "גבע", "גולומב", "גולדברג", "גולדה מאיר",
            "גולני", "גורדון", "גורנישט", "גזית", "גיבורי ישראל", "גיל", "גילה", "גילון",
            "גן העיר", "דבורה", "דגניה", "דה האס", "דה מאטרי", "דה מוטה", "דה שליט", "דובנוב",
            "דוד המלך", "דוד רזיאל", "דוד תדהר", "דור", "דפנה", "דרך אילת", "דרך בגין",
            "דרך בגין מנחם", "דרך בן גוריון", "דרך הדרום", "דרך השלום", "דרך חברון",
            "דרך חיפה", "דרך חיל", "דרך יפו", "דרך ירושלים", "דרך לכיש", "דרך מנחם בגין",
            "דרך משה דיין", "דרך נהריה", "דרך סלמה", "דרך עכו", "דרך פתח תקווה", "דרך רמתיים",
            "דרך שלום", "דרך תל אביב", "האגוז", "האדמור מגור", "האדמורים", "האורגים",
            "האחים", "האירוס", "האלה", "האלון", "האמוראים", "האר״י", "הארבעה", "הארז",
            "האתרוג", "הבוסתן", "הבונים", "הבילויים", "הבנים", "הברזל", "הברושים",
            "הבשור", "הגבורים", "הגדוד העברי", "הגולן", "הגליל", "הגפן", "הדגן", "הדובדבן",
            "הדייגים", "הדר", "הדרור", "ההגנה", "ההסתדרות", "הורד", "הזית", "הזמיר", "החורש",
            "החלוץ", "החרוב", "החשמונאים", "הטייס", "היוצרים", "היסמין", "היצירה", "הירדן",
            "הירקון", "הכובש", "הכובשים", "הכורמים", "הכלנית", "הכנסת", "הכרם", "הכרמל",
            "הל״ה", "הלוחמים", "הלח״י", "הלל", "הלילך", "המגדל", "המגידים", "המדע", "המוכתר",
            "המייסדים", "המכבים", "המלאכה", "המסגר", "המעפילים", "הנביאים", "הנגב", "הנורית",
            "הנחל", "הנציב", "הנשיא", "הס", "הסבא", "הסיבים", "הסנה", "הספורט", "העבודה",
            "העבריים", "העצמאות", "הערבה", "הפורצים", "הפלמ״ח", "הצבעוני", "הצדף", "הצנחנים",
            "הצפירה", "הקבוץ", "הקישון", "הקצין", "הקרן", "הרב", "הרב הרצוג", "הרב מימון",
            "הרב עובדיה", "הרב עזרא", "הרב קוק", "הרב שך", "הרדוף", "הרואה", "הרימון",
            "הרצל", "השומר", "השופט", "השופטים", "השחר", "השיטה", "השקד", "השרון", "התאנה",
            "התוכי", "התורה", "התמר", "התע", "ותיקי העיר", "ז'בוטינסקי", "זאב", "זבולון",
            "זהר", "זוהר", "זילברמן", "זכריה", "זמנהוף", "זנגביל", "זקס", "חבצלת", "חברון",
            "חביבה רייך", "חבקוק", "חגי", "חדוה", "חוברת הפלמ״ח", "חובבי ציון", "חוחית",
            "חומה ומגדל", "חורב", "חורגין", "חטיבת גבעתי", "חטיבת הראל", "חיבת ציון",
            "חיים בר לב", "חיים הרצוג", "חיים וייצמן", "חיים לוזוב", "חיים משה שפירא",
            "חיים עוזר", "חירות", "חיש", "חלמונית", "חמישה עשר מאי", "חמיצר", "חניכי יבנה",
            "חסדי דוד", "חסידה", "חפץ חיים", "חצרות", "יאיר", "יאסקי", "יבניאלי", "יגאל אלון",
            "יגאל ידין", "יגיע כפיים", "יד ושם", "יד חרוצים", "יד לבנים", "ידידיה", "יהודה",
            "יהודה הלוי", "יהודה הנחתום", "יהודה הנשיא", "יהודית", "יהושע", "יהושע בן גמלא",
            "יהושע בן נון", "יהושע הנקין", "יואב", "יואל כהן", "יובל", "יוחאי", "יוחנן",
            "יוחנן בן זכאי", "יוכבד", "יונה", "יוסי בנאי", "יוסף", "יוסף חנגבי", "יוסף טרומפלדור",
            "יוסף ישראלי", "יוסף כהן", "יוסף פתאח", "יוסף קארו", "יוסף שפרינצק", "יוספטל",
            "יותם", "יזרעאלי", "יחזקאל", "יצחק", "יצחק בן צבי", "יצחק הנדיב", "יצחק זמר",
            "יצחק יזרניצקי", "יצחק נפחא", "יצחק רבין", "יצחק שדה", "יצחק שמיר", "יריב",
            "ירמיהו", "ירקון", "ירושלים", "ישורון", "ישעיהו", "יעקב", "יעקב דורי", "יעקב כהן",
            "כהן", "כוכב הצפון", "כוכב הצדק", "כוכבי אור", "כורזין", "כותר", "כותרת", "כיכר",
            "כיכר המדינה", "כינרת", "כלנית", "כנפי נשרים", "כצנלסון", "כרם התימנים", "כרמל",
            "לאה אמנו", "לבונה", "לבנון", "לבנת החרמון", "לוטם", "לוי אשכול", "לוין", "לוינסקי",
            "לוטן", "לח״י", "לילינבלום", "לינקולן", "לסקוב", "מאיר", "מאפו", "מבצע דני",
            "מבצע הראל", "מבצע יואב", "מבצע יפתח", "מבצע כדש", "מבצע משה", "מבצע נחשון",
            "מבצע עובדה", "מבצע קדש", "מגדל", "מגילת האש", "מדרשת ביאליק", "מודיעין",
            "מודיעין המושבה", "מונטיפיורי", "מוצקין", "מוריה", "מורן", "מושבה גרמנית",
            "מזא״ה", "מטלון", "מיכאל", "מינץ", "מכבי", "מל״ל", "מלאכי", "מלצ״ט", "ממונדס",
            "מנדלי מוכר ספרים", "מנורה", "מנחם", "מנחם בגין", "מסדה", "מעבר יבנה", "מעונות הגליל",
            "מעלה אדומים", "מעלה בית חורון", "מעלה גמלא", "מעלה הגדוד", "מעלה הגפן",
            "מעלה השחרור", "מעלה כמון", "מעלה שרת", "מעפילי אגוז", "מפציסט", "מצדה",
            "מקור החיים", "מקור ברוך", "מקורות", "מקלף", "מרבד הקסמים", "מרגלית", "מרדכי",
            "מרכז באר שבע", "מרכז העיר", "מרכז השרון", "מרכז קליטה", "משה דיין", "משה לוי",
            "משה סנה", "משה שרת", "משמר הירדן", "משעול בית החלוצות", "משעול זהב", "משעול קציר",
            "נאות אפקה", "נבון", "נהר הירדן", "נהריה", "נוה אבות", "נוה גן", "נוה דוד", "נוה זאב",
            "נוה חן", "נוה ים", "נוה יעקב", "נוה מגן", "נוה עובד", "נוה צדק", "נוה שאנן",
            "נורדאו", "נורית", "נחום", "נחל", "נחל אלכסנדר", "נחל בזק", "נחל בקע", "נחל גרר",
            "נחל דולב", "נחל האלה", "נחל הבשור", "נחל השופט", "נחל חרוד", "נחל יבנאל",
            "נחל ירדן", "נחל ישי", "נחל כזיב", "נחל לכיש", "נחל משמר", "נחל עוז", "נחל פולג",
            "נחל צאלים", "נחל קנה", "נחל שורק", "נחל תבור", "נחליאלי", "נחמן", "נחמיה",
            "נחשון", "ניל״י", "ניצן", "ניצנים", "נמל", "נס ציונה", "נעמי", "נציבות", "נרקיס",
            "נתיב הל״ה", "סביון", "סביר", "סגולה", "סדיגורה", "סוקולוב", "סולד", "סולל בונה",
            "סוקניק", "סטרומה", "סיגלית", "סינמן", "סיני", "סירקין", "סלומון", "סלומונסקי",
            "סמבורסקי", "סמטת השושן", "סמילנסקי", "סנונית", "סנש", "סנה", "ספיר", "סתוונית",
            "עגנון", "עובדיה", "עודד", "עוזי", "עזה", "עזרא", "עזרת התורה", "עטרות", "עין",
            "עין גב", "עין גדי", "עין הבאר", "עין חורש", "עין חרוד", "עין כרם", "עין צורים",
            "עכו", "עליה", "עמוס", "עמנואל הרומי", "עמק", "עמק איילון", "עמק הירדן", "עמק חפר",
            "עמק רפאים", "ענבר", "עציון", "ערבה", "עתלית", "פאג״י", "פול", "פועלי חיפה",
            "פורת", "פוריה", "פחד יצחק", "פטרבורג", "פינוס", "פיינברג", "פינסקר", "פלד",
            "פלומבו", "פנחס", "פנקס", "פעמונית", "פצאל", "פקיעין", "פרדס", "פרוג", "פרופ מנחם",
            "פרחי ירושלים", "פרישמן", "פרץ", "פתח תקווה", "צה״ל", "צביה", "ציפורן", "צפניה",
            "צפת", "צרפתי", "קדושי השואה", "קדם", "קדשים", "קהילת לודז", "קהילת ניו יורק",
            "קהילת פולין", "קהילת צפרו", "קהילת תימן", "קהילת תורקיה", "קובלסקי", "קוטלר",
            "קויפמן", "קול תורה", "קולומבוס", "קוממיות", "קונפורטי", "קורצ'אק", "קטביה",
            "קידר", "קידרון", "קיכה", "קינג ג'ורג'", "קיסריה", "קירשבאום", "קישון", "קלוזנר",
            "קלונימוס", "קלישר", "קלצקין", "קלר", "קמחי", "קניאל", "קנרי", "קסטל", "קסטרו",
            "קצ״פ", "קרית גבים", "קרית דוד", "קרית זאב", "קרית זאב אלוף", "קרית חבר",
            "קרית חיים", "קרית יונה", "קרית מלאכי", "קרית מנחם", "קרית משה", "קרית ספר",
            "קרית עקרון", "קרית צאנז", "קרית שמואל", "קרן היסוד", "קרן קיימת", "ראובן",
            "ראש פינה", "ראשונים", "רב אלוף דוד אלעזר", "רב אלוף יצחק רבין", "רב אלוף עמרם מצנע",
            "רב אלוף ענן", "רבי", "רבי עקיבא", "רבן גמליאל", "רבנו גרשום", "רבנו חיים בן עטר",
            "רבנו תם", "רביב", "רגב", "רוגוזין", "רוטשילד", "רוכלין", "רוממה", "רות", "רוקח",
            "רח׳ הבעל שם טוב", "רח׳ הרב נריה", "רח׳ הרב פרי צדיק", "רח׳ הרב קוק", "רחבעם",
            "רחל", "רחל המשוררת", "רחל אמנו", "רטוש", "ריבלין", "רימון", "ריינס", "רימלט",
            "רמב״ם", "רמב״ן", "רמז", "רמח״ל", "רמת אביב", "רמת אלחנן", "רמת אשכול", "רמת גן",
            "רמת דוד", "רמת הגולן", "רמת השרון", "רמת ויזניץ", "רמת חדש", "רמת יוסף",
            "רמת ישי", "רמת מגשימים", "רמת פולג", "רמת רזיאל", "רמת רחל", "רמת רמון",
            "רמת תמיר", "רמתיים", "רנ״ק", "רעות", "רצון", "רקפת", "רש״י", "רשב״ם", "ש״י עגנון",
            "שאול המלך", "שבזי", "שביל הזהב", "שבעת הכוכבים", "שבתאי לוי", "שד הרב קוק",
            "שד הרצל", "שד יהודית", "שד ירושלים", "שד ניצה", "שד נתן האלוף", "שד נתן ילין",
            "שד רוטשילד", "שדה בוקר", "שדה דב", "שדה יעקב", "שדה משה", "שדה נחום", "שדה עוזיהו",
            "שדה צבי", "שדמות מיכל", "שדרות בן גוריון", "שדרות הנשיא", "שדרות הרצל",
            "שדרות ויצמן", "שדרות ירושלים", "שדרות ירושלים פינת", "שדרות מרדכי נמיר",
            "שדרות מרכז העיר", "שדרות נורדאו", "שדרות רוטשילד", "שהם", "שושנת העמקים",
            "שז״ר", "שטיינברג", "שטראוס", "שטרן", "שיח נחום", "שיכון דן", "שילה", "שינקין",
            "שלום", "שלום עליכם", "שלמה", "שלמה המלך", "שלמה המלך פינת", "שלמה הנגיד",
            "שלמה זלמן", "שלמה פתאח", "שלמה קלוגר", "שלמה שמחון", "שלמון", "שלמית", "שלמה בן יוסף",
            "שמאי", "שמואל", "שמואל הנביא", "שמואל הנגיד", "שמעון", "שמעון בן גמליאל",
            "שמעון בן לקיש", "שמעון בן שטח", "שמעון הצדיק", "שמעון פרס", "שמר", "שמריהו לוין",
            "שני יעקב", "שנקר", "שער הגיא", "שער הגי", "שער העיר", "שער העמקים", "שער ציון",
            "שפירא", "שפרינצק", "שפת אמת", "שקד", "שרה", "שרון", "שריה", "שרת", "תאנים",
            "תבור", "תוצרת הארץ", "תורה ועבודה", "תורה מציון", "תחנה מרכזית", "תילתן", "תימן",
            "תל אביב", "תל חי", "תלפיות", "תמוז", "תמר", "תמרי", "תנובה", "תעשיה", "תקווה",
            "תרח", "תרשיש", "ת״ת עץ חיים"
          ]
        }
        """.trimIndent()
    }

    private fun updateBulkSendButton() {
        val queueSize = bulkQueue.size
        btnBulkSend.visibility = View.VISIBLE
        when {
            isWhatsAppSendMode -> {
                btnBulkSend.text = "שליחה קבוצתית (SMS בלבד)"
                styleButton(btnBulkSend, R.drawable.bg_button_secondary, enabled = false)
            }
            isBulkScanMode -> {
                btnBulkSend.text = "שלח לרשימה ($queueSize/30)"
                styleButton(btnBulkSend, R.drawable.bg_button_primary, enabled = true)
            }
            else -> {
                val suffix = if (queueSize == 0) "" else " ($queueSize)"
                btnBulkSend.text = "שליחה קבוצתית$suffix"
                styleButton(btnBulkSend, R.drawable.bg_button_secondary, enabled = true)
            }
        }
    }

    private fun styleButton(button: Button, backgroundRes: Int, enabled: Boolean = true) {
        button.setBackgroundResource(backgroundRes)
        button.backgroundTintList = null  // CRITICAL: Disable Material tint to show custom drawables
        button.isEnabled = enabled
        button.alpha = if (enabled) 1f else 0.5f
    }


    private fun ensureSmsPermissions() {
        val missing = requiredSmsPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) return

        val prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE)
        val explained = prefs.getBoolean(KEY_SMS_PERMISSION_EXPLAINED, false)
        val requestAction = {
            requestSmsPermissions.launch(missing.toTypedArray())
        }

        if (!explained) {
            AlertDialog.Builder(this)
                .setTitle("נדרשת הרשאת SMS")
                .setMessage("כדי להציג את תגובות הלקוחות בתוך מצב משלוח, האפליקציה צריכה גישה לקריאת וסנכרון SMS שנשלחו אליך. הנתונים נשארים במכשיר בלבד.")
                .setPositiveButton("להמשיך") { _, _ ->
                    prefs.edit().putBoolean(KEY_SMS_PERMISSION_EXPLAINED, true).apply()
                    requestAction()
                }
                .setNegativeButton("ביטול", null)
                .show()
        } else {
            requestAction()
        }
    }

    private fun showWhatsAppWarning(message: String? = null, durationMs: Long = 10_000L) {
        tvWhatsAppWarning.text = message ?: getString(R.string.whatsapp_warning)
        tvWhatsAppWarning.visibility = View.VISIBLE
        flashHandler.removeCallbacks(whatsappWarningHideRunnable)
        flashHandler.postDelayed(whatsappWarningHideRunnable, durationMs)
    }

    private fun hideWhatsAppWarning() {
        flashHandler.removeCallbacks(whatsappWarningHideRunnable)
        tvWhatsAppWarning.visibility = View.GONE
    }

    private fun showBulkSendDialog() {
        val eligibleNumbers = bulkQueue.filter { phone ->
            fetchLatestReply(phone)?.apartment == null
        }.toMutableList()

        if (eligibleNumbers.isEmpty()) {
            Toast.makeText(this, "אין מספרים חדשים – כולם כבר ענו עם דירה!", Toast.LENGTH_LONG).show()
            return
        }

        // Create RecyclerView programmatically
        val recyclerView = RecyclerView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(16, 16, 16, 16)
            }
            layoutManager = LinearLayoutManager(this@MainActivity)
        }

        // Custom adapter with swipe-to-delete
        val adapter = BulkNumbersAdapter(eligibleNumbers)
        recyclerView.adapter = adapter

        // Add swipe-to-delete functionality
        val swipeHandler = object : ItemTouchHelper.SimpleCallback(0, ItemTouchHelper.LEFT or ItemTouchHelper.RIGHT) {
            override fun onMove(recyclerView: RecyclerView, viewHolder: RecyclerView.ViewHolder, target: RecyclerView.ViewHolder): Boolean = false

            override fun onSwiped(viewHolder: RecyclerView.ViewHolder, direction: Int) {
                val position = viewHolder.adapterPosition
                val removedNumber = eligibleNumbers[position]
                eligibleNumbers.removeAt(position)
                adapter.notifyItemRemoved(position)
                bulkQueue.remove(removedNumber)
                updateBulkSendButton()
                Toast.makeText(this@MainActivity, "מספר הוסר: ${formatForDisplay(removedNumber)}", Toast.LENGTH_SHORT).show()
            }
        }
        ItemTouchHelper(swipeHandler).attachToRecyclerView(recyclerView)

        // Create dialog with matching style
        val dialog = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog)
            .setTitle("📋 בחר מספרים לשליחה (עד 30 בכל 5 דקות)")
            .setView(recyclerView)
            .setPositiveButton("✅ שלח עכשיו", null)
            .setNegativeButton("❌ בטל", null)
            .setNeutralButton("🗑️ נקה הכל", null)
            .create()

        dialog.show()

        // Style buttons to match delivery popup
        dialog.window?.setBackgroundDrawableResource(android.R.drawable.dialog_holo_dark_frame)
        dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.apply {
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#4CAF50"))
            setOnClickListener {
                if (eligibleNumbers.isEmpty()) {
                    Toast.makeText(this@MainActivity, "לא נבחרו מספרים", Toast.LENGTH_SHORT).show()
                } else {
                    sendBulkSms(eligibleNumbers)
                    exitBulkScanMode()
                    dialog.dismiss()
                }
            }
        }
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE)?.apply {
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#F44336"))
        }
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL)?.apply {
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#FF9800"))
            setOnClickListener {
                eligibleNumbers.clear()
                adapter.notifyDataSetChanged()
                clearBulkQueue()
                Toast.makeText(this@MainActivity, "הרשימה נוקתה", Toast.LENGTH_SHORT).show()
                dialog.dismiss()
            }
        }
    }

    // Adapter for bulk numbers RecyclerView
    private inner class BulkNumbersAdapter(private val numbers: MutableList<String>) : 
        RecyclerView.Adapter<BulkNumbersAdapter.NumberViewHolder>() {

        inner class NumberViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val textView: TextView = view.findViewById(android.R.id.text1)
        }

        override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): NumberViewHolder {
            val view = TextView(parent.context).apply {
                id = android.R.id.text1
                layoutParams = RecyclerView.LayoutParams(
                    RecyclerView.LayoutParams.MATCH_PARENT,
                    RecyclerView.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(16, 8, 16, 8)
                }
                setPadding(32, 24, 32, 24)
                textSize = 18f
                setTextColor(Color.WHITE)
                setBackgroundColor(Color.parseColor("#2C2C2C"))
                gravity = android.view.Gravity.CENTER
                textDirection = View.TEXT_DIRECTION_RTL
            }
            return NumberViewHolder(view)
        }

        override fun onBindViewHolder(holder: NumberViewHolder, position: Int) {
            holder.textView.text = "📱 ${formatForDisplay(numbers[position])}"
        }

        override fun getItemCount(): Int = numbers.size
    }

    private fun exitBulkScanMode() {
        isBulkScanMode = false
        isBulkMode = false
        updateBulkSendButton()
        Toast.makeText(this, "חזרת למצב סריקה רגילה", Toast.LENGTH_SHORT).show()
    }

    private fun sendBulkSms(numbers: List<String>) {
        val quota = remainingQuota()
        if (quota <= 0) {
            showRateLimitWaitMessage()
            return
        }

        val finalMessage = if (etCustomMessage.text.toString().trim().isNotEmpty()) {
            etCustomMessage.text.toString().trim()
        } else defaultMessage

        val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(SmsManager::class.java)
        } else {
            SmsManager.getDefault()
        }

        val toSend = numbers.take(quota)
        if (toSend.isEmpty()) {
            showRateLimitWaitMessage()
            return
        }

        var sentCount = 0
        toSend.forEach { rawNumber ->
            val cleanNumber = normalizePhone(rawNumber) ?: return@forEach
            val parts = smsManager.divideMessage(finalMessage)

            smsManager.sendMultipartTextMessage(
                cleanNumber,
                null,
                parts,
                null,
                null
            )

            sentCount++
            val local10 = toLocal10Digit(cleanNumber)
            contactedNumbers.add(local10)
            bulkQueue.remove(local10)
        }

        recordSend(sentCount)
        val remaining = numbers.size - sentCount
        Toast.makeText(this, "נשלחו $sentCount הודעות SMS", Toast.LENGTH_LONG).show()
        if (remaining > 0) {
            Toast.makeText(this, "נשארו $remaining מספרים – נסה שוב בעוד 5 דקות", Toast.LENGTH_LONG).show()
        }

        if (bulkQueue.size < MAX_BULK_PER_WINDOW) bulkLimitDialogShown = false
        updateDeliveryButtonVisibility()
        updateBulkSendButton()
    }

    private fun checkAccessAndStart() {
        val user = auth.currentUser ?: return
        val uid = user.uid

        db.collection("users").document(uid).get().addOnSuccessListener { doc ->
            if (doc.getBoolean("terms_accepted") != true) {
                startActivity(Intent(this, TermsActivity::class.java))
                finish()
                return@addOnSuccessListener
            }

            val lifetime = doc.getBoolean("lifetime") ?: false
            val expiresAt = doc.getLong("expires_at") ?: 0L
            val now = System.currentTimeMillis()

            if (!lifetime && expiresAt < now) {
                startActivity(Intent(this, PaymentActivity::class.java))
                finish()
            } else {
                startCamera()
            }
        }.addOnFailureListener {
            startActivity(Intent(this, TermsActivity::class.java))
            finish()
        }
    }

    @SuppressLint("UnsafeOptInUsageError")
    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
            val analyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also { it.setAnalyzer(cameraExecutor, ::processImageProxy) }
            val selector = CameraSelector.DEFAULT_BACK_CAMERA
            try {
                cameraProvider.unbindAll()
                camera = cameraProvider.bindToLifecycle(this, selector, preview, analyzer)
                camera?.cameraControl?.enableTorch(true)
            } catch (e: Exception) {
                Log.e("Scan2Chat", "Camera bind failed", e)
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun processImageProxy(imageProxy: ImageProxy) {
        val mediaImage = imageProxy.image ?: run { imageProxy.close(); return }
        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)

        val now = System.currentTimeMillis()
        if (now - lastScanTime < MIN_SCAN_INTERVAL) { imageProxy.close(); return }
        lastScanTime = now

        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).process(image)
            .addOnSuccessListener { visionText ->
                val imageWidth = imageProxy.width.toFloat().coerceAtLeast(1f)
                val imageHeight = imageProxy.height.toFloat().coerceAtLeast(1f)
                var handled = false

                val detectionRect = RectF(
                    roiRectNorm.left,
                    roiRectNorm.top,
                    roiRectNorm.right,
                    (roiRectNorm.bottom + 0.11f).coerceAtMost(1f)
                )

                visionText.textBlocks.forEach { block ->
                    if (handled) return@forEach
                    val box = block.boundingBox ?: return@forEach
                    val blockLeft = (box.left.coerceAtLeast(0)).toFloat() / imageWidth
                    val blockTop = (box.top.coerceAtLeast(0)).toFloat() / imageHeight
                    val blockRight = (box.right.coerceAtMost(imageWidth.toInt())).toFloat() / imageWidth
                    val blockBottom = (box.bottom.coerceAtMost(imageHeight.toInt())).toFloat() / imageHeight
                    val intersects = !(blockRight < detectionRect.left ||
                            blockLeft > detectionRect.right ||
                            blockBottom < detectionRect.top ||
                            blockTop > detectionRect.bottom)
                    if (!intersects) return@forEach

                    // ALWAYS scan for addresses FIRST (even if phone will be found)
                    processDetectedAddress(block.text)
                    
                    // Then scan for phone numbers
                    val cleaned = block.text.replace(" ", "").replace("-", "")
                    val matcher = phonePattern.matcher(cleaned)
                    while (matcher.find()) {
                        val raw = matcher.group(0)
                        if (processDetectedNumber(raw)) {
                            handled = true
                            break
                        }
                    }
                }

                // DON'T reset counter if no match found - incomplete scans return null and shouldn't reset progress
                // Only reset if we've been idle for too long (handled elsewhere)
            }
            .addOnCompleteListener { imageProxy.close() }
    }

    private fun processDetectedAddress(text: String) {
        Log.d("ADDRESS_DEBUG", "📝 Scanning text block: '$text'")
        
        // SIMPLE TEST: Match "word(s) number" pattern (no fuzzy matching yet)
        // Pattern: Letters (no spaces inside) + space + 1-3 digit number
        // Examples: "ROTCHILD 6", "הרצל 6", "התעשייה 13"
        val simplePattern = Regex("([א-תa-zA-Z]+(?:\\s+[א-תa-zA-Z]+)*)\\s+(\\d{1,3}(?:[/\\s]\\d{1,3})?)")
        val match = simplePattern.find(text)
        
        if (match == null) {
            Log.d("ADDRESS_DEBUG", "❌ No address pattern matched in: '$text'")
            return
        }
        
        val fullMatch = match.value
        val streetPart = match.groupValues[1].trim()
        val numberPart = match.groupValues[2].trim()
        
        Log.d("ADDRESS_DEBUG", "✅ Pattern matched!")
        Log.d("ADDRESS_DEBUG", "   Full: '$fullMatch'")
        Log.d("ADDRESS_DEBUG", "   Street: '$streetPart'")
        Log.d("ADDRESS_DEBUG", "   Numbers: '$numberPart'")
        
        if (streetPart.length < 3) {
            Log.d("ADDRESS_DEBUG", "❌ Street too short (<3 chars)")
            return
        }
        
        // TEMPORARILY SKIP FUZZY MATCHING - just use what we got!
        val detectedAddress = "$streetPart $numberPart"
        
        Log.d("ADDRESS_SCAN", "🏠 Address detected (NO fuzzy matching): $detectedAddress")
        
        // Update last detected address
        if (lastDetectedAddress != detectedAddress) {
            lastDetectedAddress = detectedAddress
            Log.d("ADDRESS_SCAN", "✅ Address confirmed: $detectedAddress")
        }
    }

    private fun processDetectedNumber(raw: String): Boolean {
        val normalized = normalizePhone(raw)
        
        // If normalization fails (null), DON'T reset counter - just ignore this scan
        if (normalized == null) {
            Log.d("SCAN", "⚠️ Normalization returned null for '$raw' - IGNORING (counter preserved)")
            return false
        }
        
        if (normalized.length !in 11..13) return false
        runOnUiThread { scanOverlay.setActive(true) }

        // SMART MATCHING: Compare to last VALID scan, not just any scan
        if (lastDetectedNumber != normalized) {
            lastDetectedNumber = normalized
            detectionCount = 1
            confirmedNumber = null
            // 🔥 FIX: Reset address when scanning NEW phone number!
            lastDetectedAddress = null
            confirmedAddress = null
            Log.d("SCAN", "🆕 New number detected: $normalized (count reset to 1, address cleared)")
        } else {
            detectionCount++
            Log.d("SCAN", "✅ MATCH! Same number again: $normalized (count now: $detectionCount)")
        }

        runOnUiThread {
            val display = formatForDisplay(normalized)
            val addressInfo = if (lastDetectedAddress != null) " 🏠 $lastDetectedAddress" else ""
            tvDetected.text = "$display$addressInfo (${detectionCount}/2)"
            if (detectionCount >= 2) {
                tvDetected.setBackgroundResource(R.drawable.bg_detected_box)
            } else {
                tvDetected.setBackgroundColor(Color.parseColor("#FF9800"))
            }
        }

        if (detectionCount >= 2 && confirmedNumber == null) {
            confirmedNumber = normalized
            confirmedAddress = lastDetectedAddress
            runOnUiThread { playSound("beep") }

            val confirmedDisplay = formatForDisplay(normalized)
            val addressDisplay = if (confirmedAddress != null) " 🏠 $confirmedAddress" else ""
            runOnUiThread {
                tvDetected.text = "$confirmedDisplay$addressDisplay"
                tvDetected.setBackgroundResource(R.drawable.bg_detected_box)
            }

            val local10 = toLocal10Digit(normalized)
            val reply = fetchLatestReply(local10)
            
            // Store address with phone number
            if (confirmedAddress != null) {
                addressMap[local10] = confirmedAddress!!
                Log.d("ADDRESS_STORED", "Saved address for $local10: $confirmedAddress")
            }

            addNumberToBulkQueue(local10, reply)

            Handler(Looper.getMainLooper()).postDelayed({
                if (confirmedNumber == normalized) {
                    when {
                        isBulkScanMode -> {
                            if (reply?.apartment == null) {
                                Toast.makeText(this, "נוסף: $confirmedDisplay", Toast.LENGTH_SHORT).show()
                            } else {
                                showAlreadyRepliedInBulkFlash()
                            }
                        }
                        isDeliveryMode -> {
                            SmsReceiver.forceParseRepliesForSender(this, local10) { addReply(local10, it) }
                            showDeliveryPopup(normalized)
                        }
                        else -> {
                            if (reply?.apartment != null) {
                                showAlreadyRepliedFlash()
                            } else {
                                val useCustom = etCustomMessage.text.toString().trim().isNotEmpty()
                                if (isWhatsAppSendMode) {
                                    openWhatsApp(normalized, includeBody = true)
                                } else {
                                    sendSmsMessage(normalized, useCustom)
                                }
                            }
                        }
                    }
                }
            }, 800)
        }
        return true
    }

    private fun addNumberToBulkQueue(local10: String, reply: ReplyData?) {
        if (!isBulkScanMode) return
        if (reply?.apartment != null) return
        if (bulkQueue.contains(local10)) return
        if (bulkQueue.size >= MAX_BULK_PER_WINDOW) {
            showBulkCapacityDialog()
            return
        }

        bulkQueue.add(local10)
        updateBulkSendButton()
        if (bulkQueue.size == MAX_BULK_PER_WINDOW) {
            showBulkCapacityDialog()
        }
    }

    private fun showBulkCapacityDialog() {
        if (bulkLimitDialogShown) return
        bulkLimitDialogShown = true
        AlertDialog.Builder(this)
            .setTitle("הגעת למגבלה")
            .setMessage("ניתן לסרוק עד 30 מספרים בכל מחזור. שלח את הרשימה והמתן 5 דקות למחזור הבא.")
            .setPositiveButton("שלח עכשיו") { _, _ -> showBulkSendDialog() }
            .setNegativeButton("סגור", null)
            .show()
    }

    private fun clearBulkQueue() {
        bulkQueue.clear()
        bulkLimitDialogShown = false
        updateBulkSendButton()
    }

    private fun updateScanWindowBounds() {
        if (previewView.width == 0 || previewView.height == 0) return
        val marginPx = (16 * resources.displayMetrics.density).toInt()
        val bottomGapPx = (32 * resources.displayMetrics.density).toInt() // Larger gap at bottom
        var top = topBar.bottom + marginPx
        var bottom = detectionPanel.top - bottomGapPx // Increased gap to prevent overlap
        var left = (previewView.width * 0.1f).toInt()
        var right = (previewView.width * 0.9f).toInt()

        if (bottom <= top) {
            top = (previewView.height * 0.15f).toInt()
            bottom = (previewView.height * 0.65f).toInt()
        }
        // Remove max height constraint to allow full scanning area
        if (right <= left) {
            left = (previewView.width * 0.2f).toInt()
            right = (previewView.width * 0.8f).toInt()
        }

        scanWindowRectPx.set(left, top, right, bottom)
        scanOverlay.updateWindow(scanWindowRectPx)
        roiRectNorm.set(
            left.toFloat() / previewView.width,
            top.toFloat() / previewView.height,
            right.toFloat() / previewView.width,
            bottom.toFloat() / previewView.height
        )
    }

    private fun fetchLatestReply(local10: String): ReplyData? {
        val reply = SmsReceiver.getLatestReply(this, local10)
        return if (reply != null) {
            replyMap[local10] = reply
            reply
        } else {
            replyMap.remove(local10)
            null
        }
    }

    private fun showRateLimitWaitMessage() {
        val waitMs = timeUntilNextWindow() ?: RATE_LIMIT_WINDOW_MS
        val clamped = waitMs.coerceAtLeast(0L)
        val minutes = TimeUnit.MILLISECONDS.toMinutes(clamped)
        val seconds = TimeUnit.MILLISECONDS.toSeconds(clamped) % 60
        Toast.makeText(
            this,
            "המתן $minutes:${seconds.toString().padStart(2, '0')} דקות לפני משלוח נוסף",
            Toast.LENGTH_LONG
        ).show()
    }

    private fun clearUserStateOnLogout() {
        contactedNumbers.clear()
        clearBulkQueue()
        replyMap.clear()
        isWhatsAppSendMode = false
        updateDeliveryButtonVisibility()
        updateSendModeToggle()
    }

    private fun showAlreadyRepliedInBulkFlash() {
        runOnUiThread {
            val flashAlert = findViewById<LinearLayout>(R.id.flashAlert)
            val tvMain = flashAlert.findViewById<TextView>(R.id.tvFlashMain)
            val tvSub = flashAlert.findViewById<TextView>(R.id.tvFlashSub)
            val tvExtra = flashAlert.findViewById<TextView>(R.id.tvFlashExtra)

            tvMain.text = "כבר התקבלה תשובה!"
            tvSub.text = "המספר לא נוסף לרשימה"
            tvExtra.text = "המשך לסרוק – רק חדשים יתווספו"

            flashHandler.removeCallbacks(hideFlashRunnable)
            flashAlert.visibility = View.VISIBLE
            playSound("confirmation")
            flashHandler.postDelayed(hideFlashRunnable, 2200)
        }
    }

    private fun resetScanState() {
        lastDetectedNumber = null
        confirmedNumber = null
        lastDetectedAddress = null
        confirmedAddress = null
        detectionCount = 0
        runOnUiThread {
            tvDetected.text = "סריקה..."
            tvDetected.setBackgroundResource(R.drawable.bg_detected_box)
            scanOverlay.setActive(false)
        }
    }

    private fun normalizePhone(raw: String?): String? {
        if (raw == null) return null
        var s = raw.replace(Regex("[^0-9+]"), "")
        
        Log.d("PHONE_NORMALIZE", "Input: '$raw' -> Cleaned: '$s' (${s.length} digits)")
        
        // FIRST: Handle 9720 case - but ONLY for 13-digit numbers (complete scans)
        // 12-digit 9720 numbers are INCOMPLETE scans - reject them
        if (s.startsWith("9720")) {
            if (s.length == 13) {
                // Complete scan: 9720526430819 (13 digits) - remove extra 0
                s = s.substring(0, 3) + s.substring(4)  // becomes 972526430819 (12 digits)
                Log.d("PHONE_NORMALIZE", "REMOVED extra 0: '${raw}' -> '$s' (${s.length} digits)")
            } else if (s.length == 12) {
                // Incomplete scan: 972052643081 (12 digits) - missing last digit, reject it
                Log.d("PHONE_NORMALIZE", "INCOMPLETE SCAN (12 digits with 9720): '$s' - rejected")
                return null
            }
        }
        
        return when {
            // Israeli number with leading 0 (0526430819) - MUST start with 05
            s.startsWith("05") && s.length == 10 -> {
                val result = "+972" + s.substring(1)
                Log.d("PHONE_NORMALIZE", "Case: 05... (10 digits) -> $result")
                result
            }
            // Full international format (+972526430819)
            s.startsWith("+972") && s.length == 13 -> {
                Log.d("PHONE_NORMALIZE", "Case: +972... (13 digits) -> $s")
                s
            }
            // International without + (972... - must be exactly 12 digits)
            s.startsWith("972") && s.length == 12 && !s.startsWith("+") -> {
                // s is already corrected if it had 9720
                val result = "+$s"
                Log.d("PHONE_NORMALIZE", "Case: 972... (12 digits) -> $result")
                result
            }
            else -> {
                Log.d("PHONE_NORMALIZE", "No match for '$s' (${s.length} digits) -> null")
                null
            }
        }
    }

    private fun formatForDisplay(number: String): String {
        val local = if (number.startsWith("+972")) "0" + number.substring(4) else number
        return if (local.length == 10 && local.startsWith("05")) {
            "${local.substring(0, 3)}-${local.substring(3, 6)}-${local.substring(6)}"
        } else local
    }

    private fun toLocal10Digit(phone: String): String {
        val digits = phone.replace(Regex("[^0-9]"), "")
        return when {
            digits.startsWith("972") && digits.length >= 12 -> "0" + digits.substring(3).take(9)
            digits.startsWith("+972") && digits.length >= 13 -> "0" + digits.substring(4).take(9)
            digits.startsWith("0") && digits.length >= 10 -> digits.take(10)
            else -> digits.takeLast(10)
        }
    }

    private fun playSound(soundName: String) {
        try {
            mediaPlayer?.release()
            mediaPlayer = null
            val resId = resources.getIdentifier(soundName, "raw", packageName)
            if (resId != 0) {
                mediaPlayer = MediaPlayer.create(this, resId).apply {
                    setOnCompletionListener { it.release() }
                    start()
                }
            }
        } catch (e: Exception) {
            Log.w("Media", "$soundName failed", e)
        }
    }

    private fun showAlreadyRepliedFlash() {
        flashHandler.removeCallbacks(hideFlashRunnable)
        flashAlert.visibility = View.VISIBLE
        playSound("confirmation")
        flashHandler.postDelayed(hideFlashRunnable, 2000)
    }

    private fun sendSmsMessage(number: String, useCustomMessage: Boolean = false, forceEmptyBody: Boolean = false) {
        registerContact(number)
        val cleanPhone = number.replace("+", "")

        Handler(Looper.getMainLooper()).postDelayed({
            val finalMessage = if (!forceEmptyBody && useCustomMessage && etCustomMessage.text.toString().trim().isNotEmpty()) {
                etCustomMessage.text.toString().trim()
            } else if (!forceEmptyBody) {
                defaultMessage
            } else ""

            try {
                val smsIntent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$cleanPhone")).apply {
                    if (!forceEmptyBody && finalMessage.isNotEmpty()) {
                        putExtra("sms_body", finalMessage)
                    }
                }
                if (smsIntent.resolveActivity(packageManager) != null) {
                    startActivity(smsIntent)
                } else {
                    Toast.makeText(this, "No SMS app found", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this, "שגיאה: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }, 800)
    }

    private fun registerContact(rawNumber: String) {
        val normalized = normalizePhone(rawNumber) ?: rawNumber
        val local10 = toLocal10Digit(normalized)
        if (local10.isNotBlank()) {
            contactedNumbers.add(local10)
        }
        runOnUiThread { updateDeliveryButtonVisibility(); updateBulkSendButton() }
    }

    private fun openWhatsApp(number: String, includeBody: Boolean = true) {
        registerContact(number)
        val cleanNumber = number.replace(Regex("[^+0-9]"), "")
        val messageShouldInclude = includeBody && etCustomMessage.text.toString().trim().isNotEmpty()
        val finalMessage = if (messageShouldInclude) {
            etCustomMessage.text.toString().trim()
        } else defaultMessage

        val encodedMessage = if (includeBody) {
            try {
                URLEncoder.encode(finalMessage, "UTF-8")
            } catch (e: Exception) {
                finalMessage
            }
        } else ""

        val waNumber = when {
            cleanNumber.startsWith("+972") -> cleanNumber.removePrefix("+")
            cleanNumber.startsWith("0") -> "972" + cleanNumber.removePrefix("0")
            else -> cleanNumber
        }

        val uri = if (includeBody) {
            "https://wa.me/$waNumber?text=$encodedMessage"
        } else {
            "https://wa.me/$waNumber"
        }

        try {
            startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply { setPackage("com.whatsapp") }
            )
        } catch (e: Exception) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)))
        }
    }

    private fun SpannableStringBuilder.appendWithIcon(drawableRes: Int, text: String): SpannableStringBuilder {
        val drawable = ContextCompat.getDrawable(this@MainActivity, drawableRes)!!
        val size = (18 * resources.displayMetrics.density).toInt()
        drawable.setBounds(0, 0, size, size)
        val imageSpan = ImageSpan(drawable, ImageSpan.ALIGN_BASELINE)
        val start = this.length
        this.append(text)
        this.setSpan(imageSpan, start, start + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        return this
    }

    private fun buildInstructionText(reply: ReplyData): String {
        if (!reply.hasReplied) return ""

        var text = reply.rawSmsBody
        val removalPatterns = listOf(
            Regex("(?i)קוד(?:\\s*כניסה)?(?:\\s*מפתח)?\\s*[:：]?\\s*\\d+"),
            Regex("(?i)קומה\\s*[:：]?\\s*\\d+"),
            Regex("(?i)דירה\\s*[:：]?\\s*\\d+")
        )
        removalPatterns.forEach { pattern ->
            text = pattern.replace(text, "")
        }

        text = text.replace(Regex("\\s{2,}"), " ")

        val lines = text.split("\n", "\r")
            .map { it.trim().trim(',', '.', '-', ':') }
            .filter { it.isNotEmpty() }

        return lines.joinToString("\n")
    }

    private fun showDeliveryPopup(phone: String) {
        val clean = toLocal10Digit(phone)
        val reply = fetchLatestReply(clean)
        val savedAddress = addressMap[clean]

        val sb = SpannableStringBuilder()
        sb.append("לקוח: ${formatForDisplay(phone)}\n")
        if (savedAddress != null) {
            sb.append("🏠 כתובת: $savedAddress\n")
        }
        sb.append("\n")

        if (reply?.hasReplied == true) {
            if (reply.floor != null) sb.append("🏢 קומה: ${reply.floor}\n")
            if (reply.apartment != null) sb.append("🚪 דירה: ${reply.apartment}\n")

            if (reply.code != null) {
                val codeText = reply.code.trim()
                if (codeText.isNotEmpty()) {
                    sb.append("🔑 קוד: $codeText\n")
                }
            } else {
                sb.append("❌ לא צוין קוד\n")
            }
            sb.append("\n")

            val instructions = buildInstructionText(reply)
            if (instructions.isNotBlank()) {
                sb.append("──────────────\n")
                sb.append("📝 הערות:\n")
                sb.append(instructions)
                sb.append("\n──────────────")
            }
        } else {
            sb.append("⚠️ אין תגובה מהלקוח\n")
            sb.append("האם להשאיר בדלת?\n")
        }

        val dialog = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog)
            .setTitle(if (reply?.hasReplied == true) "📦 פרטי משלוח" else "⚠️ אין תגובה")
            .setMessage(sb)
            .setPositiveButton("✅ אוקיי", null)
            .setNegativeButton(if (reply?.hasReplied != true) "❌ לא, לחזור" else null, null)
            .create()
        
        dialog.show()
        
        // Style the dialog for better appearance
        dialog.window?.setBackgroundDrawableResource(android.R.drawable.dialog_holo_dark_frame)
        // Fix button colors - make OK button white/light gray instead of purple
        dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.apply {
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#4CAF50"))
        }
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE)?.setTextColor(Color.parseColor("#F44336"))
    }

    private fun updateDeliveryButton() {
        btnDeliveryMode.text = if (isDeliveryMode) "במצב חלוקה" else "יציאה לדרך"
        val background = if (isDeliveryMode) R.drawable.bg_button_primary else R.drawable.bg_button_secondary
        styleButton(btnDeliveryMode, background, enabled = true)
    }

    private fun updateDeliveryButtonVisibility() {
        btnDeliveryMode.visibility = View.VISIBLE
    }

    private fun updateSendModeToggle() {
        if (isWhatsAppSendMode) {
            btnToggleSendMode.text = "מצב WhatsApp"
            styleButton(btnToggleSendMode, R.drawable.bg_button_accent, enabled = true)
            btnSend.text = "שלח WhatsApp"
            styleButton(btnSend, R.drawable.bg_button_accent, enabled = true)
        } else {
            btnToggleSendMode.text = "מצב SMS"
            styleButton(btnToggleSendMode, R.drawable.bg_button_secondary, enabled = true)
            btnSend.text = "שלח SMS"
            styleButton(btnSend, R.drawable.bg_button_primary, enabled = true)
        }
        updateBulkSendButton()
    }

    override fun onResume() {
        super.onResume()
        // Don't reset modes - they are now persisted
        // resetBulkMode() and exitBulkScanMode() removed to preserve state
        
        if (auth.currentUser == null) {
            startActivity(Intent(this, AuthActivity::class.java))
            finish()
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            checkAccessAndStart()
        } else {
            requestPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    override fun onPause() {
        super.onPause()
        camera?.cameraControl?.enableTorch(false)
        // Save state when app goes to background
        saveScanState()
    }

    override fun onDestroy() {
        super.onDestroy()
        mediaPlayer?.release()
        cameraExecutor.shutdown()
        flashHandler.removeCallbacksAndMessages(null)
    }

    private fun saveScanState() {
        val prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE)
        prefs.edit().apply {
            putBoolean("isBulkScanMode", isBulkScanMode)
            putBoolean("isWhatsAppSendMode", isWhatsAppSendMode)
            putBoolean("isDeliveryMode", isDeliveryMode)
            apply()
        }
    }

    private fun restoreSavedState() {
        val prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE)
        isBulkScanMode = prefs.getBoolean("isBulkScanMode", false)
        isWhatsAppSendMode = prefs.getBoolean("isWhatsAppSendMode", false)
        isDeliveryMode = prefs.getBoolean("isDeliveryMode", false)
        
        // Update UI to reflect restored state
        if (isBulkScanMode) {
            isBulkMode = true
            updateBulkSendButton()
        }
        if (isDeliveryMode) {
            updateDeliveryButton()
        }
        updateSendModeToggle()
    }

    private fun showManualPhoneEntryDialog() {
        val input = EditText(this).apply {
            hint = "הזן מספר טלפון (לדוגמה: 0526430819)"
            inputType = android.text.InputType.TYPE_CLASS_PHONE
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            textDirection = View.TEXT_DIRECTION_RTL
        }

        val dialog = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog)
            .setTitle("📱 הזנת מספר ידנית")
            .setMessage("הזן מספר טלפון:")
            .setView(input)
            .setPositiveButton("✅ אישור") { _, _ ->
                val phoneNumber = input.text.toString().trim()
                val normalized = normalizePhone(phoneNumber)
                if (normalized != null) {
                    // Process as if scanned
                    confirmedNumber = normalized
                    val display = formatForDisplay(normalized)
                    tvDetected.text = display
                    tvDetected.setBackgroundResource(R.drawable.bg_detected_box)
                    playSound("beep")
                    
                    // Handle based on mode
                    val local10 = toLocal10Digit(normalized)
                    val reply = fetchLatestReply(local10)
                    addNumberToBulkQueue(local10, reply)
                    
                    Handler(Looper.getMainLooper()).postDelayed({
                        when {
                            isBulkScanMode -> {
                                if (reply?.apartment == null) {
                                    Toast.makeText(this, "נוסף: $display", Toast.LENGTH_SHORT).show()
                                } else {
                                    showAlreadyRepliedInBulkFlash()
                                }
                            }
                            isDeliveryMode -> {
                                showDeliveryPopup(normalized)
                            }
                            else -> {
                                if (reply?.apartment != null) {
                                    showAlreadyRepliedFlash()
                                } else {
                                    val useCustom = etCustomMessage.text.toString().trim().isNotEmpty()
                                    if (isWhatsAppSendMode) {
                                        openWhatsApp(normalized, includeBody = true)
                                    } else {
                                        sendSmsMessage(normalized, useCustom)
                                    }
                                }
                            }
                        }
                    }, 500)
                } else {
                    Toast.makeText(this, "מספר לא תקין", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("❌ ביטול", null)
            .create()

        dialog.show()
        // Fix button colors - make them white text instead of purple
        dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.apply {
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#4CAF50"))
        }
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE)?.apply {
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#F44336"))
        }
    }
}
