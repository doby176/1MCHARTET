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
    private var addressDetectionCount = 0
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

    data class StreetData(val en: String, val he: String)

    companion object {
        val bulkQueue = LinkedHashSet<String>()
        val contactedNumbers = mutableSetOf<String>()
        val replyMap = mutableMapOf<String, ReplyData>()
        val addressMap = mutableMapOf<String, String>() // phone -> address
        var isDeliveryMode = false
        var isBulkMode = false
        private var onReplyUpdate: (() -> Unit)? = null
        lateinit var appContext: Context
        private val streetsList = mutableListOf<StreetData>()

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

        // Find closest matching street name and return Hebrew translation
        fun findClosestStreet(scanned: String): Pair<String, Double>? {
            if (streetsList.isEmpty() || scanned.isBlank()) return null

            var bestMatch: StreetData? = null
            var bestScore = 0.0

            streetsList.forEach { street ->
                // Match against BOTH English AND Hebrew names
                val scoreEnglish = similarity(scanned, street.en)
                val scoreHebrew = similarity(scanned, street.he)

                // Use whichever match is better
                val maxScore = maxOf(scoreEnglish, scoreHebrew)

                if (maxScore > bestScore) {
                    bestScore = maxScore
                    bestMatch = street
                }
            }

            // Return result if ANY match found (caller will check threshold)
            return if (bestMatch != null && bestScore > 0.0) {
                Pair(bestMatch!!.he, bestScore)
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
                val streetObj = streetsArray.getJSONObject(i)
                val en = streetObj.getString("en")
                val he = streetObj.getString("he")
                streetsList.add(StreetData(en, he))
            }
            Log.d("STREETS_DB", "✅ SUCCESS! Loaded ${streetsList.size} streets with translations")
            Log.d("STREETS_DB", "🔍 First 3 examples: ${streetsList.take(3).joinToString(", ") { "${it.en}→${it.he}" }}")
        } catch (e: Exception) {
            Log.e("STREETS_DB", "❌ FATAL ERROR loading streets database: ${e.message}", e)
            e.printStackTrace()
        }
    }

    private fun getStreetsJSON(): String {
        // TOP 500 MOST COMMON ISRAELI STREETS - English → Hebrew Translation
        // Focus: Central Israel (Rishon LeZion, Holon, Nes Ziona, Rehovot, Tel Aviv, Ramat Gan)
        // Embedded directly in code - no external file needed!
        return """
        {
          "streets": [
            {"en": "Herzl", "he": "הרצל"}, {"en": "Ben Gurion", "he": "בן גוריון"}, {"en": "Weizmann", "he": "ויצמן"},
            {"en": "Rothschild", "he": "רוטשילד"}, {"en": "ROTCHILD", "he": "רוטשילד"}, {"en": "Rotchild", "he": "רוטשילד"},
            {"en": "Dizengoff", "he": "דיזנגוף"}, {"en": "Allenby", "he": "אלנבי"}, {"en": "Jaffa", "he": "יפו"},
            {"en": "Yaffo", "he": "יפו"}, {"en": "Yafo", "he": "יפו"}, {"en": "Yehuda Halevi", "he": "יהודה הלוי"},
            {"en": "King George", "he": "קינג ג'ורג'"}, {"en": "Harav Kook", "he": "הרב קוק"}, {"en": "Ben Yehuda", "he": "בן יהודה"},
            {"en": "Sheinkin", "he": "שינקין"}, {"en": "Ibn Gabirol", "he": "אבן גבירול"}, {"en": "Nachalat Binyamin", "he": "נחלת בנימין"},
            {"en": "HaKovesh", "he": "הכובש"}, {"en": "Yoel Cohen", "he": "יואל כהן"}, {"en": "Chana Michael Levin", "he": "חנה ומיכאל לוין"},
            {"en": "Machali Halevi", "he": "מחלי הלוי"}, {"en": "HaTaasia", "he": "התעשייה"}, {"en": "HaNasi", "he": "הנשיא"},
            {"en": "Jabotinsky", "he": "ז'בוטינסקי"}, {"en": "Zhabotinsky", "he": "ז'בוטינסקי"}, {"en": "Jabotinski", "he": "ז'בוטינסקי"},
            {"en": "Harav Maimon", "he": "הרב מימון"}, {"en": "Sokolov", "he": "סוקולוב"}, {"en": "Arlozorov", "he": "ארלוזורוב"},
            {"en": "Arlozorow", "he": "ארלוזורוב"}, {"en": "Nordau", "he": "נורדאו"}, {"en": "Menachem Begin", "he": "מנחם בגין"},
            {"en": "Begin", "he": "בגין"}, {"en": "Moshe Sharett", "he": "משה שרת"}, {"en": "Levi Eshkol", "he": "לוי אשכול"},
            {"en": "Eshkol", "he": "אשכול"}, {"en": "Golda Meir", "he": "גולדה מאיר"}, {"en": "Yitzhak Rabin", "he": "יצחק רבין"},
            {"en": "Rabin", "he": "רבין"}, {"en": "King David", "he": "דוד המלך"}, {"en": "David HaMelech", "he": "דוד המלך"},
            {"en": "King Solomon", "he": "שלמה המלך"}, {"en": "Shlomo HaMelech", "he": "שלמה המלך"}, {"en": "King Saul", "he": "שאול המלך"},
            {"en": "Shaul HaMelech", "he": "שאול המלך"}, {"en": "Jeremiah", "he": "ירמיהו"}, {"en": "Isaiah", "he": "ישעיהו"},
            {"en": "Ezekiel", "he": "יחזקאל"}, {"en": "Daniel", "he": "דניאל"}, {"en": "Samuel", "he": "שמואל"},
            {"en": "Shmuel", "he": "שמואל"}, {"en": "Elijah", "he": "אליהו"}, {"en": "Eliyahu HaNavi", "he": "אליהו הנביא"},
            {"en": "Balfour", "he": "בלפור"}, {"en": "Bialik", "he": "ביאליק"}, {"en": "Ahad Haam", "he": "אחד העם"},
            {"en": "Ahad Ha'am", "he": "אחד העם"}, {"en": "Shimon HaTzadik", "he": "שמעון הצדיק"}, {"en": "Rambam", "he": "רמב״ם"},
            {"en": "Rashi", "he": "רש״י"}, {"en": "Ramban", "he": "הרמב״ן"}, {"en": "Derech Hebron", "he": "דרך חברון"},
            {"en": "Derech Jaffa", "he": "דרך יפו"}, {"en": "Derech Ben Gurion", "he": "דרך בן גוריון"}, {"en": "Derech Herzl", "he": "דרך הרצל"},
            {"en": "Derech Shalom", "he": "דרך שלום"}, {"en": "Derech Yerushalayim", "he": "דרך ירושלים"}, {"en": "Derech Jerusalem", "he": "דרך ירושלים"},
            {"en": "Derech Heil", "he": "דרך חיל"}, {"en": "Derech Holon", "he": "דרך חולון"}, {"en": "Derech Rishon", "he": "דרך ראשון"},
            {"en": "Derech Rehovot", "he": "דרך רחובות"}, {"en": "Derech Nes Ziona", "he": "דרך נס ציונה"}, {"en": "Derech Ramat Gan", "he": "דרך רמת גן"},
            {"en": "Sderot Rothschild", "he": "שדרות רוטשילד"}, {"en": "Sderot Yerushalayim", "he": "שדרות ירושלים"}, {"en": "Sderot Ben Gurion", "he": "שדרות בן גוריון"},
            {"en": "Sderot Herzl", "he": "שדרות הרצל"}, {"en": "Sderot Weizmann", "he": "שדרות ויצמן"}, {"en": "Sderot Chen", "he": "שדרות חן"},
            {"en": "Sderot Yehudit", "he": "שדרות יהודית"}, {"en": "HaRishonim", "he": "הראשונים"}, {"en": "HaAtzmaut", "he": "העצמאות"},
            {"en": "HaGefen", "he": "הגפן"}, {"en": "HaZayit", "he": "הזית"}, {"en": "HaTeena", "he": "התאנה"},
            {"en": "HaRimon", "he": "הרימון"}, {"en": "HaTamar", "he": "התמר"}, {"en": "HaAlon", "he": "האלון"},
            {"en": "HaErez", "he": "הארז"}, {"en": "HaBrosh", "he": "הברוש"}, {"en": "HaOren", "he": "האורן"},
            {"en": "HaShaked", "he": "השקד"}, {"en": "HaCharuv", "he": "החרוב"}, {"en": "HaDekel", "he": "הדקל"},
            {"en": "Einstein", "he": "איינשטיין"}, {"en": "Bar Kochba", "he": "בר כוכבא"}, {"en": "Bar Kokhba", "he": "בר כוכבא"},
            {"en": "HaNachal", "he": "הנחל"}, {"en": "HaGalil", "he": "הגליל"}, {"en": "Yaakov Dori", "he": "יעקב דורי"},
            {"en": "Eliezer Ben Yehuda", "he": "אליעזר בן יהודה"}, {"en": "Gordon", "he": "גורדון"}, {"en": "David Raziel", "he": "דוד רזיאל"},
            {"en": "Derech Eilat", "he": "דרך אילת"}, {"en": "Derech Begin", "he": "דרך בגין"}, {"en": "Derech HaDarom", "he": "דרך הדרום"},
            {"en": "Derech HaShalom", "he": "דרך השלום"}, {"en": "Derech Haifa", "he": "דרך חיפה"}, {"en": "Derech Lakish", "he": "דרך לכיש"},
            {"en": "Derech Tel Aviv", "he": "דרך תל אביב"}, {"en": "HaHagana", "he": "ההגנה"}, {"en": "HaHistadrut", "he": "ההסתדרות"},
            {"en": "HaPalmach", "he": "הפלמ״ח"}, {"en": "HaYarkon", "he": "הירקון"}, {"en": "HaKnesset", "he": "הכנסת"},
            {"en": "HaKarmel", "he": "הכרמל"}, {"en": "HaNevii'm", "he": "הנביאים"}, {"en": "HaNevi'im", "he": "הנביאים"},
            {"en": "HaNegev", "he": "הנגב"}, {"en": "HaSharon", "he": "השרון"}, {"en": "HaMelacha", "he": "המלאכה"},
            {"en": "HaTidhar", "he": "התדהר"}, {"en": "HaBonim", "he": "הבונים"}, {"en": "HaChalutz", "he": "החלוץ"},
            {"en": "HaShomer", "he": "השומר"}, {"en": "Lincoln", "he": "לינקולן"}, {"en": "Meir", "he": "מאיר"},
            {"en": "Montefiore", "he": "מונטיפיורי"}, {"en": "Michael", "he": "מיכאל"}, {"en": "Masada", "he": "מסדה"},
            {"en": "Moshe Dayan", "he": "משה דיין"}, {"en": "Dayan", "he": "דיין"}, {"en": "Nahalat Binyamin", "he": "נחלת בנימין"},
            {"en": "Nahariya", "he": "נהריה"}, {"en": "Yitzhak Sadeh", "he": "יצחק שדה"}, {"en": "Yosef Hanasi", "he": "יוסף הנשיא"},
            {"en": "Yoseftal", "he": "יוספטל"}, {"en": "Keren Kayemet", "he": "קרן קיימת"}, {"en": "Keren Hayesod", "he": "קרן היסוד"},
            {"en": "Kiryat Gat", "he": "קרית גת"}, {"en": "Ramat Gan", "he": "רמת גן"}, {"en": "Ramat Aviv", "he": "רמת אביב"},
            {"en": "Ramat HaSharon", "he": "רמת השרון"}, {"en": "Rachel", "he": "רחל"}, {"en": "Reuven", "he": "ראובן"},
            {"en": "Remez", "he": "רמז"}, {"en": "Rishon LeZion", "he": "ראשון לציון"}, {"en": "Rishon", "he": "ראשון"},
            {"en": "Nes Ziona", "he": "נס ציונה"}, {"en": "Nes Tziona", "he": "נס ציונה"}, {"en": "Rehovot", "he": "רחובות"},
            {"en": "Tel Aviv", "he": "תל אביב"}, {"en": "Tel Hai", "he": "תל חי"}, {"en": "Haifa", "he": "חיפה"},
            {"en": "Jerusalem", "he": "ירושלים"}, {"en": "Yerushalayim", "he": "ירושלים"}, {"en": "Beer Sheva", "he": "באר שבע"},
            {"en": "Be'er Sheva", "he": "באר שבע"}, {"en": "Netanya", "he": "נתניה"}, {"en": "Petah Tikva", "he": "פתח תקווה"},
            {"en": "Petach Tikva", "he": "פתח תקווה"}, {"en": "Holon", "he": "חולון"}, {"en": "Bnei Brak", "he": "בני ברק"},
            {"en": "Ashdod", "he": "אשדוד"}, {"en": "Ashkelon", "he": "אשקלון"}, {"en": "Yigal Alon", "he": "יגאל אלון"},
            {"en": "Alon", "he": "אלון"}, {"en": "Brenner", "he": "ברנר"}, {"en": "Trumpeldor", "he": "טרומפלדור"},
            {"en": "Tchernicho", "he": "טשרניחובסקי"}, {"en": "Tschernichowsky", "he": "טשרניחובסקי"}, {"en": "Wolfson", "he": "וולפסון"},
            {"en": "Katznelson", "he": "קצנלסון"}, {"en": "Katz", "he": "כץ"}, {"en": "Cohen", "he": "כהן"},
            {"en": "Levi", "he": "לוי"}, {"en": "Bloch", "he": "בלוך"}, {"en": "Stricker", "he": "שטריקר"},
            {"en": "Shazar", "he": "שז״ר"}, {"en": "Yigal Yadin", "he": "יגאל ידין"}, {"en": "Yadin", "he": "ידין"},
            {"en": "Sirkin", "he": "סירקין"}, {"en": "HaYovel", "he": "היובל"}, {"en": "HaGiborim", "he": "הגיבורים"},
            {"en": "HaLohamim", "he": "הלוחמים"}, {"en": "HaHaganah", "he": "ההגנה"}, {"en": "HaMaccabi", "he": "המכבי"},
            {"en": "HaMaccabim", "he": "המכבים"}, {"en": "HaShikmim", "he": "השקמים"}, {"en": "HaRakafot", "he": "הרקפות"},
            {"en": "HaVradim", "he": "הוורדים"}, {"en": "HaNarkisim", "he": "הנרקיסים"}, {"en": "HaTmarim", "he": "התמרים"},
            {"en": "HaRimonim", "he": "הרימונים"}, {"en": "HaTzanhanim", "he": "הצנחנים"}, {"en": "Frishman", "he": "פרישמן"},
            {"en": "Frug", "he": "פרוג"}, {"en": "Pinsker", "he": "פינסקר"}, {"en": "Lilienblum", "he": "לילינבלום"},
            {"en": "Smolenskin", "he": "סמולנסקין"}, {"en": "Mapu", "he": "מאפו"}, {"en": "Mendele", "he": "מנדלי"},
            {"en": "Shalom Aleichem", "he": "שלום עליכם"}, {"en": "Peretz", "he": "פרץ"}, {"en": "Shlonsky", "he": "שלונסקי"},
            {"en": "Greenberg", "he": "גרינברג"}, {"en": "Shenkar", "he": "שנקר"}, {"en": "Haim Weizmann", "he": "חיים וייצמן"},
            {"en": "Chaim Weizmann", "he": "חיים וייצמן"}, {"en": "Agnon", "he": "עגנון"}, {"en": "Alterman", "he": "אלתרמן"},
            {"en": "Goldberg", "he": "גולדברג"}, {"en": "Leah Goldberg", "he": "לאה גולדברג"}, {"en": "Natan Alterman", "he": "נתן אלתרמן"},
            {"en": "Kfar Sava", "he": "כפר סבא"}, {"en": "Kfar Saba", "he": "כפר סבא"}, {"en": "Hod Hasharon", "he": "הוד השרון"},
            {"en": "Rosh HaAyin", "he": "ראש העין"}, {"en": "Lod", "he": "לוד"}, {"en": "Ramla", "he": "רמלה"},
            {"en": "Yavne", "he": "יבנה"}, {"en": "Gedera", "he": "גדרה"}, {"en": "Shoham", "he": "שוהם"},
            {"en": "Modi'in", "he": "מודיעין"}, {"en": "Modiin", "he": "מודיעין"}, {"en": "Gan Yavne", "he": "גן יבנה"},
            {"en": "Kiryat Ono", "he": "קרית אונו"}, {"en": "Or Yehuda", "he": "אור יהודה"}, {"en": "Givat Shmuel", "he": "גבעת שמואל"},
            {"en": "Bat Yam", "he": "בת ים"}, {"en": "Azur", "he": "אזור"}, {"en": "Azor", "he": "אזור"},
            {"en": "Usishkin", "he": "אוסישקין"}, {"en": "Menachem Usishkin", "he": "מנחם אוסישקין"}, {"en": "Hovevei Zion", "he": "חובבי ציון"},
            {"en": "Bnei Dan", "he": "בני דן"}, {"en": "Derech Menachem Begin", "he": "דרך מנחם בגין"}, {"en": "Derech Namir", "he": "דרך נמיר"},
            {"en": "Derech Petach Tikva", "he": "דרך פתח תקווה"}, {"en": "Kibbutz Galuyot", "he": "קיבוץ גלויות"}, {"en": "La Guardia", "he": "לה גוארדיה"},
            {"en": "Ibn Ezra", "he": "אבן עזרא"}, {"en": "Yehuda HaLevi", "he": "יהודה הלוי"}, {"en": "Shlomo Ibn Gabirol", "he": "שלמה אבן גבירול"},
            {"en": "Kaplan", "he": "קפלן"}, {"en": "Hamasger", "he": "המסגר"}, {"en": "Harakevet", "he": "הרכבת"},
            {"en": "Salame", "he": "סלמה"}, {"en": "Rothschild Boulevard", "he": "שדרות רוטשילד"}, {"en": "Rothschild Blvd", "he": "שדרות רוטשילד"},
            {"en": "Chen Boulevard", "he": "שדרות חן"}, {"en": "Chen Blvd", "he": "שדרות חן"}, {"en": "Shaul HaMelech Boulevard", "he": "שדרות שאול המלך"},
            {"en": "Rabin Square", "he": "כיכר רבין"}, {"en": "Dizengoff Square", "he": "כיכר דיזנגוף"}, {"en": "Kikar Hamedina", "he": "כיכר המדינה"},
            {"en": "State Square", "he": "כיכר המדינה"}, {"en": "Yarkon Park", "he": "פארק הירקון"}, {"en": "HaYarkon Park", "he": "פארק הירקון"},
            {"en": "Carmel Market", "he": "שוק הכרמל"}, {"en": "Shuk HaCarmel", "he": "שוק הכרמל"}, {"en": "Levinsky Market", "he": "שוק לבינסקי"},
            {"en": "Mahane Yehuda", "he": "מחנה יהודה"}, {"en": "Old Jaffa", "he": "יפו העתיקה"}, {"en": "Neve Tzedek", "he": "נווה צדק"},
            {"en": "Florentine", "he": "פלורנטין"}, {"en": "Shapira", "he": "שפירא"}, {"en": "Kerem HaTemanim", "he": "כרם התימנים"},
            {"en": "Kerem", "he": "כרם"}, {"en": "Nachalat", "he": "נחלת"}, {"en": "Yad Eliyahu", "he": "יד אליהו"},
            {"en": "Ezra", "he": "עזרא"}, {"en": "Hatikva", "he": "התקווה"}, {"en": "Giv'at", "he": "גבעת"},
            {"en": "Givat Herzl", "he": "גבעת הרצל"}, {"en": "Kiryat Shalom", "he": "קרית שלום"}, {"en": "Ramat Aviv Gimmel", "he": "רמת אביב ג"},
            {"en": "Ramat Aviv Alef", "he": "רמת אביב א"}, {"en": "Ramat Aviv Bet", "he": "רמת אביב ב"}, {"en": "Tzahala", "he": "צהלה"},
            {"en": "Ramat Hahayal", "he": "רמת החייל"}, {"en": "Bavli", "he": "בבלי"}, {"en": "Shikun Dan", "he": "שיכון דן"},
            {"en": "Yarkon", "he": "ירקון"}, {"en": "Nachmani", "he": "נחמני"}, {"en": "Montefiori", "he": "מונטיפיורי"},
            {"en": "David Elazar", "he": "דוד אלעזר"}, {"en": "Elazar", "he": "אלעזר"}, {"en": "Haim Bar Lev", "he": "חיים בר לב"},
            {"en": "Bar Lev", "he": "בר לב"}, {"en": "Bar Ilan", "he": "בר אילן"}, {"en": "Shimon Peres", "he": "שמעון פרס"},
            {"en": "Peres", "he": "פרס"}, {"en": "Reuven Rivlin", "he": "ראובן ריבלין"}, {"en": "Rivlin", "he": "ריבלין"},
            {"en": "Ariel Sharon", "he": "אריאל שרון"}, {"en": "Sharon", "he": "שרון"}, {"en": "Netanyahu", "he": "נתניהו"},
            {"en": "Yitzhak Shamir", "he": "יצחק שמיר"}, {"en": "Shamir", "he": "שמיר"}, {"en": "Ehud Barak", "he": "אהוד ברק"},
            {"en": "Barak", "he": "ברק"}, {"en": "Ben Sira", "he": "בן סירא"}, {"en": "Ben Zvi", "he": "בן צבי"},
            {"en": "Ben Shemen", "he": "בן שמן"}, {"en": "Ben Ammi", "he": "בן עמי"}, {"en": "Ben Tzvi", "he": "בן צבי"},
            {"en": "Bar Giora", "he": "בר גיורא"}, {"en": "Bar Yochai", "he": "בר יוחאי"}, {"en": "Yosef Trumpeldor", "he": "יוסף טרומפלדור"},
            {"en": "Meir Dizengoff", "he": "מאיר דיזנגוף"}, {"en": "Chaim Herzog", "he": "חיים הרצוג"}, {"en": "Herzog", "he": "הרצוג"},
            {"en": "Yair Lapid", "he": "יאיר לפיד"}, {"en": "Lapid", "he": "לפיד"}, {"en": "HaIvrit", "he": "העברית"},
            {"en": "HaShalom", "he": "השלום"}, {"en": "HaMada", "he": "המדע"}, {"en": "HaTarbut", "he": "התרבות"},
            {"en": "HaSport", "he": "הספורט"}, {"en": "HaBriut", "he": "הבריאות"}, {"en": "HaChinuch", "he": "החינוך"},
            {"en": "HaBitachon", "he": "הביטחון"}, {"en": "HaTa'asiya", "he": "התעשייה"}, {"en": "HaMis'har", "he": "המסחר"},
            {"en": "HaBustan", "he": "הבוסתן"}, {"en": "HaSadeh", "he": "השדה"}, {"en": "HaKfar", "he": "הכפר"},
            {"en": "HaYishuv", "he": "הישוב"}, {"en": "HaMoledet", "he": "המולדת"}, {"en": "HaSefer", "he": "הספר"},
            {"en": "HaSifriya", "he": "הספרייה"}, {"en": "HaTeatron", "he": "התיאטרון"}, {"en": "HaUniversita", "he": "האוניברסיטה"},
            {"en": "HaTechnion", "he": "הטכניון"}, {"en": "HaRofe", "he": "הרופא"}, {"en": "HaBait Cholim", "he": "בית חולים"},
            {"en": "HaRefua", "he": "הרפואה"}, {"en": "Nahal Sorek", "he": "נחל שורק"}, {"en": "Nahal Ayalon", "he": "נחל איילון"},
            {"en": "Nahal Yarkon", "he": "נחל הירקון"}, {"en": "Nahal Kishon", "he": "נחל קישון"}, {"en": "Nahal Alexander", "he": "נחל אלכסנדר"},
            {"en": "Nahal Lakhish", "he": "נחל לכיש"}, {"en": "Nahal Besor", "he": "נחל בשור"}, {"en": "Nahal Hadera", "he": "נחל חדרה"},
            {"en": "Beit Dagan", "he": "בית דגן"}, {"en": "Yehud", "he": "יהוד"}, {"en": "Yehud Monosson", "he": "יהוד מונוסון"},
            {"en": "Kiryat Motzkin", "he": "קרית מוצקין"}, {"en": "Kiryat Yam", "he": "קרית ים"}, {"en": "Kiryat Bialik", "he": "קרית ביאליק"},
            {"en": "Kiryat Haim", "he": "קרית חיים"}, {"en": "Kiryat Malachi", "he": "קרית מלאכי"}, {"en": "Kiryat Ekron", "he": "קרית עקרון"},
            {"en": "Hadera", "he": "חדרה"}, {"en": "Caesarea", "he": "קיסריה"}, {"en": "Zichron Ya'akov", "he": "זכרון יעקב"},
            {"en": "Zichron Yaakov", "he": "זכרון יעקב"}, {"en": "Binyamina", "he": "בנימינה"}, {"en": "Pardes Hanna", "he": "פרדס חנה"},
            {"en": "Or Akiva", "he": "אור עקיבא"}, {"en": "Yokne'am", "he": "יקנעם"}, {"en": "Afula", "he": "עפולה"},
            {"en": "Beit Shean", "he": "בית שאן"}, {"en": "Beit She'an", "he": "בית שאן"}, {"en": "Kiryat Shmona", "he": "קרית שמונה"},
            {"en": "Carmiel", "he": "כרמיאל"}, {"en": "Ma'alot", "he": "מעלות"}, {"en": "Akko", "he": "עכו"},
            {"en": "Acre", "he": "עכו"}, {"en": "Tiberias", "he": "טבריה"}, {"en": "Tverya", "he": "טבריה"},
            {"en": "Tzfat", "he": "צפת"}, {"en": "Safed", "he": "צפת"}, {"en": "Eilat", "he": "אילת"},
            {"en": "Mitzpe Ramon", "he": "מצפה רמון"}, {"en": "Dimona", "he": "דימונה"}, {"en": "Arad", "he": "ערד"},
            {"en": "Sderot", "he": "שדרות"}, {"en": "Ofakim", "he": "אופקים"}, {"en": "Netivot", "he": "נתיבות"},
            // RISHON LEZION STREETS - Comprehensive List
            {"en": "Nirim", "he": "נירים"}, {"en": "Nirim Street", "he": "רחוב נירים"}, {"en": "Rehov Nirim", "he": "רחוב נירים"},
            {"en": "Shlomo Eliraz", "he": "שלמה אלירז"}, {"en": "Shlomo", "he": "שלמה"}, {"en": "Eliraz", "he": "אלירז"},
            {"en": "HaRishonim", "he": "הראשונים"}, {"en": "Rishonim", "he": "ראשונים"}, {"en": "HaRishon", "he": "הראשון"},
            {"en": "Derech Rishon LeZion", "he": "דרך ראשון לציון"}, {"en": "Derech Rishon", "he": "דרך ראשון"},
            {"en": "Sderot Rishon LeZion", "he": "שדרות ראשון לציון"}, {"en": "Sderot Rishon", "he": "שדרות ראשון"},
            {"en": "Herzl", "he": "הרצל"}, {"en": "Rehov Herzl", "he": "רחוב הרצל"}, {"en": "Sderot Herzl", "he": "שדרות הרצל"},
            {"en": "Weizmann", "he": "ויצמן"}, {"en": "Rehov Weizmann", "he": "רחוב ויצמן"}, {"en": "Sderot Weizmann", "he": "שדרות ויצמן"},
            {"en": "Ben Gurion", "he": "בן גוריון"}, {"en": "Rehov Ben Gurion", "he": "רחוב בן גוריון"}, {"en": "Sderot Ben Gurion", "he": "שדרות בן גוריון"},
            {"en": "Jabotinsky", "he": "ז'בוטינסקי"}, {"en": "Rehov Jabotinsky", "he": "רחוב ז'בוטינסקי"}, {"en": "Zhabotinsky", "he": "ז'בוטינסקי"},
            {"en": "Rothschild", "he": "רוטשילד"}, {"en": "Rehov Rothschild", "he": "רחוב רוטשילד"}, {"en": "Sderot Rothschild", "he": "שדרות רוטשילד"},
            {"en": "HaKovesh", "he": "הכובש"}, {"en": "Rehov HaKovesh", "he": "רחוב הכובש"},
            {"en": "HaNasi", "he": "הנשיא"}, {"en": "Rehov HaNasi", "he": "רחוב הנשיא"},
            {"en": "HaAtzmaut", "he": "העצמאות"}, {"en": "Rehov HaAtzmaut", "he": "רחוב העצמאות"}, {"en": "Sderot HaAtzmaut", "he": "שדרות העצמאות"},
            {"en": "HaMelacha", "he": "המלאכה"}, {"en": "Rehov HaMelacha", "he": "רחוב המלאכה"},
            {"en": "HaTaasia", "he": "התעשייה"}, {"en": "Rehov HaTaasia", "he": "רחוב התעשייה"},
            {"en": "HaShalom", "he": "השלום"}, {"en": "Rehov HaShalom", "he": "רחוב השלום"}, {"en": "Sderot HaShalom", "he": "שדרות השלום"},
            {"en": "HaYam", "he": "הים"}, {"en": "Rehov HaYam", "he": "רחוב הים"},
            {"en": "HaGefen", "he": "הגפן"}, {"en": "Rehov HaGefen", "he": "רחוב הגפן"},
            {"en": "HaZayit", "he": "הזית"}, {"en": "Rehov HaZayit", "he": "רחוב הזית"},
            {"en": "HaRimon", "he": "הרימון"}, {"en": "Rehov HaRimon", "he": "רחוב הרימון"},
            {"en": "HaTamar", "he": "התמר"}, {"en": "Rehov HaTamar", "he": "רחוב התמר"},
            {"en": "HaAlon", "he": "האלון"}, {"en": "Rehov HaAlon", "he": "רחוב האלון"},
            {"en": "HaErez", "he": "הארז"}, {"en": "Rehov HaErez", "he": "רחוב הארז"},
            {"en": "HaBrosh", "he": "הברוש"}, {"en": "Rehov HaBrosh", "he": "רחוב הברוש"},
            {"en": "HaOren", "he": "האורן"}, {"en": "Rehov HaOren", "he": "רחוב האורן"},
            {"en": "HaShaked", "he": "השקד"}, {"en": "Rehov HaShaked", "he": "רחוב השקד"},
            {"en": "HaCharuv", "he": "החרוב"}, {"en": "Rehov HaCharuv", "he": "רחוב החרוב"},
            {"en": "HaDekel", "he": "הדקל"}, {"en": "Rehov HaDekel", "he": "רחוב הדקל"},
            {"en": "Bialik", "he": "ביאליק"}, {"en": "Rehov Bialik", "he": "רחוב ביאליק"},
            {"en": "Tchernichowsky", "he": "טשרניחובסקי"}, {"en": "Rehov Tchernichowsky", "he": "רחוב טשרניחובסקי"},
            {"en": "Agnon", "he": "עגנון"}, {"en": "Rehov Agnon", "he": "רחוב עגנון"},
            {"en": "Alterman", "he": "אלתרמן"}, {"en": "Rehov Alterman", "he": "רחוב אלתרמן"},
            {"en": "Shalom Aleichem", "he": "שלום עליכם"}, {"en": "Rehov Shalom Aleichem", "he": "רחוב שלום עליכם"},
            {"en": "Peretz", "he": "פרץ"}, {"en": "Rehov Peretz", "he": "רחוב פרץ"},
            {"en": "Gordon", "he": "גורדון"}, {"en": "Rehov Gordon", "he": "רחוב גורדון"},
            {"en": "Ahad Haam", "he": "אחד העם"}, {"en": "Rehov Ahad Haam", "he": "רחוב אחד העם"},
            {"en": "Rambam", "he": "רמב״ם"}, {"en": "Rehov Rambam", "he": "רחוב רמב״ם"},
            {"en": "Rashi", "he": "רש״י"}, {"en": "Rehov Rashi", "he": "רחוב רש״י"},
            {"en": "King David", "he": "דוד המלך"}, {"en": "Rehov King David", "he": "רחוב דוד המלך"}, {"en": "David HaMelech", "he": "דוד המלך"},
            {"en": "King Solomon", "he": "שלמה המלך"}, {"en": "Shlomo HaMelech", "he": "שלמה המלך"}, {"en": "Rehov Shlomo HaMelech", "he": "רחוב שלמה המלך"},
            {"en": "King Saul", "he": "שאול המלך"}, {"en": "Shaul HaMelech", "he": "שאול המלך"}, {"en": "Rehov Shaul HaMelech", "he": "רחוב שאול המלך"},
            {"en": "Jeremiah", "he": "ירמיהו"}, {"en": "Rehov Jeremiah", "he": "רחוב ירמיהו"},
            {"en": "Isaiah", "he": "ישעיהו"}, {"en": "Rehov Isaiah", "he": "רחוב ישעיהו"},
            {"en": "Ezekiel", "he": "יחזקאל"}, {"en": "Rehov Ezekiel", "he": "רחוב יחזקאל"},
            {"en": "Daniel", "he": "דניאל"}, {"en": "Rehov Daniel", "he": "רחוב דניאל"},
            {"en": "Samuel", "he": "שמואל"}, {"en": "Shmuel", "he": "שמואל"}, {"en": "Rehov Shmuel", "he": "רחוב שמואל"},
            {"en": "Elijah", "he": "אליהו"}, {"en": "Eliyahu HaNavi", "he": "אליהו הנביא"}, {"en": "Rehov Eliyahu", "he": "רחוב אליהו"},
            {"en": "Rachel", "he": "רחל"}, {"en": "Rehov Rachel", "he": "רחוב רחל"},
            {"en": "Reuven", "he": "ראובן"}, {"en": "Rehov Reuven", "he": "רחוב ראובן"},
            {"en": "Levi", "he": "לוי"}, {"en": "Rehov Levi", "he": "רחוב לוי"},
            {"en": "Yehuda", "he": "יהודה"}, {"en": "Rehov Yehuda", "he": "רחוב יהודה"},
            {"en": "Yosef", "he": "יוסף"}, {"en": "Rehov Yosef", "he": "רחוב יוסף"},
            {"en": "Binyamin", "he": "בנימין"}, {"en": "Rehov Binyamin", "he": "רחוב בנימין"},
            {"en": "Dan", "he": "דן"}, {"en": "Rehov Dan", "he": "רחוב דן"},
            {"en": "Naftali", "he": "נפתלי"}, {"en": "Rehov Naftali", "he": "רחוב נפתלי"},
            {"en": "Gad", "he": "גד"}, {"en": "Rehov Gad", "he": "רחוב גד"},
            {"en": "Asher", "he": "אשר"}, {"en": "Rehov Asher", "he": "רחוב אשר"},
            {"en": "Yissachar", "he": "יששכר"}, {"en": "Rehov Yissachar", "he": "רחוב יששכר"},
            {"en": "Zevulun", "he": "זבולון"}, {"en": "Rehov Zevulun", "he": "רחוב זבולון"},
            {"en": "Simcha", "he": "שמחה"}, {"en": "Rehov Simcha", "he": "רחוב שמחה"},
            {"en": "Haim", "he": "חיים"}, {"en": "Chaim", "he": "חיים"}, {"en": "Rehov Haim", "he": "רחוב חיים"},
            {"en": "Moshe", "he": "משה"}, {"en": "Rehov Moshe", "he": "רחוב משה"},
            {"en": "Aharon", "he": "אהרן"}, {"en": "Rehov Aharon", "he": "רחוב אהרן"},
            {"en": "David", "he": "דוד"}, {"en": "Rehov David", "he": "רחוב דוד"},
            {"en": "Shlomo", "he": "שלמה"}, {"en": "Rehov Shlomo", "he": "רחוב שלמה"},
            {"en": "Yitzhak", "he": "יצחק"}, {"en": "Rehov Yitzhak", "he": "רחוב יצחק"},
            {"en": "Yaakov", "he": "יעקב"}, {"en": "Rehov Yaakov", "he": "רחוב יעקב"},
            {"en": "Avraham", "he": "אברהם"}, {"en": "Rehov Avraham", "he": "רחוב אברהם"},
            {"en": "Yosef Trumpeldor", "he": "יוסף טרומפלדור"}, {"en": "Trumpeldor", "he": "טרומפלדור"}, {"en": "Rehov Trumpeldor", "he": "רחוב טרומפלדור"},
            {"en": "Bar Kochba", "he": "בר כוכבא"}, {"en": "Bar Kokhba", "he": "בר כוכבא"}, {"en": "Rehov Bar Kochba", "he": "רחוב בר כוכבא"},
            {"en": "Einstein", "he": "איינשטיין"}, {"en": "Rehov Einstein", "he": "רחוב איינשטיין"},
            {"en": "Montefiore", "he": "מונטיפיורי"}, {"en": "Rehov Montefiore", "he": "רחוב מונטיפיורי"},
            {"en": "Balfour", "he": "בלפור"}, {"en": "Rehov Balfour", "he": "רחוב בלפור"},
            {"en": "Sokolov", "he": "סוקולוב"}, {"en": "Rehov Sokolov", "he": "רחוב סוקולוב"},
            {"en": "Arlozorov", "he": "ארלוזורוב"}, {"en": "Rehov Arlozorov", "he": "רחוב ארלוזורוב"},
            {"en": "Nordau", "he": "נורדאו"}, {"en": "Rehov Nordau", "he": "רחוב נורדאו"},
            {"en": "Menachem Begin", "he": "מנחם בגין"}, {"en": "Begin", "he": "בגין"}, {"en": "Rehov Begin", "he": "רחוב בגין"},
            {"en": "Yitzhak Rabin", "he": "יצחק רבין"}, {"en": "Rabin", "he": "רבין"}, {"en": "Rehov Rabin", "he": "רחוב רבין"},
            {"en": "Golda Meir", "he": "גולדה מאיר"}, {"en": "Rehov Golda", "he": "רחוב גולדה"},
            {"en": "Levi Eshkol", "he": "לוי אשכול"}, {"en": "Eshkol", "he": "אשכול"}, {"en": "Rehov Eshkol", "he": "רחוב אשכול"},
            {"en": "Moshe Sharett", "he": "משה שרת"}, {"en": "Rehov Sharett", "he": "רחוב שרת"},
            {"en": "HaYovel", "he": "היובל"}, {"en": "Rehov HaYovel", "he": "רחוב היובל"},
            {"en": "HaGiborim", "he": "הגיבורים"}, {"en": "Rehov HaGiborim", "he": "רחוב הגיבורים"},
            {"en": "HaLohamim", "he": "הלוחמים"}, {"en": "Rehov HaLohamim", "he": "רחוב הלוחמים"},
            {"en": "HaHaganah", "he": "ההגנה"}, {"en": "Rehov HaHaganah", "he": "רחוב ההגנה"},
            {"en": "HaMaccabi", "he": "המכבי"}, {"en": "Rehov HaMaccabi", "he": "רחוב המכבי"},
            {"en": "HaMaccabim", "he": "המכבים"}, {"en": "Rehov HaMaccabim", "he": "רחוב המכבים"},
            {"en": "HaShikmim", "he": "השקמים"}, {"en": "Rehov HaShikmim", "he": "רחוב השקמים"},
            {"en": "HaRakafot", "he": "הרקפות"}, {"en": "Rehov HaRakafot", "he": "רחוב הרקפות"},
            {"en": "HaVradim", "he": "הוורדים"}, {"en": "Rehov HaVradim", "he": "רחוב הוורדים"},
            {"en": "HaNarkisim", "he": "הנרקיסים"}, {"en": "Rehov HaNarkisim", "he": "רחוב הנרקיסים"},
            {"en": "HaTmarim", "he": "התמרים"}, {"en": "Rehov HaTmarim", "he": "רחוב התמרים"},
            {"en": "HaRimonim", "he": "הרימונים"}, {"en": "Rehov HaRimonim", "he": "רחוב הרימונים"},
            {"en": "HaTzanhanim", "he": "הצנחנים"}, {"en": "Rehov HaTzanhanim", "he": "רחוב הצנחנים"},
            {"en": "HaBonim", "he": "הבונים"}, {"en": "Rehov HaBonim", "he": "רחוב הבונים"},
            {"en": "HaChalutz", "he": "החלוץ"}, {"en": "Rehov HaChalutz", "he": "רחוב החלוץ"},
            {"en": "HaShomer", "he": "השומר"}, {"en": "Rehov HaShomer", "he": "רחוב השומר"},
            {"en": "HaPalmach", "he": "הפלמ״ח"}, {"en": "Rehov HaPalmach", "he": "רחוב הפלמ״ח"},
            {"en": "HaYarkon", "he": "הירקון"}, {"en": "Rehov HaYarkon", "he": "רחוב הירקון"},
            {"en": "HaKarmel", "he": "הכרמל"}, {"en": "Rehov HaKarmel", "he": "רחוב הכרמל"},
            {"en": "HaNegev", "he": "הנגב"}, {"en": "Rehov HaNegev", "he": "רחוב הנגב"},
            {"en": "HaSharon", "he": "השרון"}, {"en": "Rehov HaSharon", "he": "רחוב השרון"},
            {"en": "HaKnesset", "he": "הכנסת"}, {"en": "Rehov HaKnesset", "he": "רחוב הכנסת"},
            {"en": "HaNevi'im", "he": "הנביאים"}, {"en": "Rehov HaNevi'im", "he": "רחוב הנביאים"},
            {"en": "HaHistadrut", "he": "ההסתדרות"}, {"en": "Rehov HaHistadrut", "he": "רחוב ההסתדרות"},
            {"en": "Keren Kayemet", "he": "קרן קיימת"}, {"en": "Rehov Keren Kayemet", "he": "רחוב קרן קיימת"},
            {"en": "Keren Hayesod", "he": "קרן היסוד"}, {"en": "Rehov Keren Hayesod", "he": "רחוב קרן היסוד"},
            {"en": "Hovevei Zion", "he": "חובבי ציון"}, {"en": "Rehov Hovevei Zion", "he": "רחוב חובבי ציון"},
            {"en": "Bilu", "he": "ביל״ו"}, {"en": "Rehov Bilu", "he": "רחוב ביל״ו"},
            {"en": "HaBikurim", "he": "הביכורים"}, {"en": "Rehov HaBikurim", "he": "רחוב הביכורים"},
            {"en": "HaKfar", "he": "הכפר"}, {"en": "Rehov HaKfar", "he": "רחוב הכפר"},
            {"en": "HaYishuv", "he": "הישוב"}, {"en": "Rehov HaYishuv", "he": "רחוב הישוב"},
            {"en": "HaMoledet", "he": "המולדת"}, {"en": "Rehov HaMoledet", "he": "רחוב המולדת"},
            {"en": "HaTidhar", "he": "התדהר"}, {"en": "Rehov HaTidhar", "he": "רחוב התדהר"},
            {"en": "HaSadeh", "he": "השדה"}, {"en": "Rehov HaSadeh", "he": "רחוב השדה"},
            {"en": "HaBustan", "he": "הבוסתן"}, {"en": "Rehov HaBustan", "he": "רחוב הבוסתן"},
            {"en": "HaTeena", "he": "התאנה"}, {"en": "Rehov HaTeena", "he": "רחוב התאנה"},
            {"en": "HaSefer", "he": "הספר"}, {"en": "Rehov HaSefer", "he": "רחוב הספר"},
            {"en": "HaSifriya", "he": "הספרייה"}, {"en": "Rehov HaSifriya", "he": "רחוב הספרייה"},
            {"en": "HaTeatron", "he": "התיאטרון"}, {"en": "Rehov HaTeatron", "he": "רחוב התיאטרון"},
            {"en": "HaUniversita", "he": "האוניברסיטה"}, {"en": "Rehov HaUniversita", "he": "רחוב האוניברסיטה"},
            {"en": "HaTechnion", "he": "הטכניון"}, {"en": "Rehov HaTechnion", "he": "רחוב הטכניון"},
            {"en": "HaRofe", "he": "הרופא"}, {"en": "Rehov HaRofe", "he": "רחוב הרופא"},
            {"en": "HaBait Cholim", "he": "בית חולים"}, {"en": "Rehov HaBait Cholim", "he": "רחוב בית חולים"},
            {"en": "HaRefua", "he": "הרפואה"}, {"en": "Rehov HaRefua", "he": "רחוב הרפואה"},
            {"en": "HaSport", "he": "הספורט"}, {"en": "Rehov HaSport", "he": "רחוב הספורט"},
            {"en": "HaBriut", "he": "הבריאות"}, {"en": "Rehov HaBriut", "he": "רחוב הבריאות"},
            {"en": "HaChinuch", "he": "החינוך"}, {"en": "Rehov HaChinuch", "he": "רחוב החינוך"},
            {"en": "HaBitachon", "he": "הביטחון"}, {"en": "Rehov HaBitachon", "he": "רחוב הביטחון"},
            {"en": "HaTa'asiya", "he": "התעשייה"}, {"en": "Rehov HaTa'asiya", "he": "רחוב התעשייה"},
            {"en": "HaMis'har", "he": "המסחר"}, {"en": "Rehov HaMis'har", "he": "רחוב המסחר"},
            {"en": "HaTarbut", "he": "התרבות"}, {"en": "Rehov HaTarbut", "he": "רחוב התרבות"},
            {"en": "HaMada", "he": "המדע"}, {"en": "Rehov HaMada", "he": "רחוב המדע"},
            {"en": "HaIvrit", "he": "העברית"}, {"en": "Rehov HaIvrit", "he": "רחוב העברית"},
            {"en": "Nahal Sorek", "he": "נחל שורק"}, {"en": "Rehov Nahal Sorek", "he": "רחוב נחל שורק"},
            {"en": "Nahal Ayalon", "he": "נחל איילון"}, {"en": "Rehov Nahal Ayalon", "he": "רחוב נחל איילון"},
            {"en": "Nahal Yarkon", "he": "נחל הירקון"}, {"en": "Rehov Nahal Yarkon", "he": "רחוב נחל הירקון"},
            {"en": "Nahal Kishon", "he": "נחל קישון"}, {"en": "Rehov Nahal Kishon", "he": "רחוב נחל קישון"},
            {"en": "Nahal Alexander", "he": "נחל אלכסנדר"}, {"en": "Rehov Nahal Alexander", "he": "רחוב נחל אלכסנדר"},
            {"en": "Nahal Lakhish", "he": "נחל לכיש"}, {"en": "Rehov Nahal Lakhish", "he": "רחוב נחל לכיש"},
            {"en": "Nahal Besor", "he": "נחל בשור"}, {"en": "Rehov Nahal Besor", "he": "רחוב נחל בשור"},
            {"en": "Nahal Hadera", "he": "נחל חדרה"}, {"en": "Rehov Nahal Hadera", "he": "רחוב נחל חדרה"},
            {"en": "Yigal Alon", "he": "יגאל אלון"}, {"en": "Alon", "he": "אלון"}, {"en": "Rehov Yigal Alon", "he": "רחוב יגאל אלון"},
            {"en": "Yigal Yadin", "he": "יגאל ידין"}, {"en": "Yadin", "he": "ידין"}, {"en": "Rehov Yadin", "he": "רחוב ידין"},
            {"en": "David Raziel", "he": "דוד רזיאל"}, {"en": "Rehov Raziel", "he": "רחוב רזיאל"},
            {"en": "Yaakov Dori", "he": "יעקב דורי"}, {"en": "Rehov Dori", "he": "רחוב דורי"},
            {"en": "Eliezer Ben Yehuda", "he": "אליעזר בן יהודה"}, {"en": "Rehov Ben Yehuda", "he": "רחוב בן יהודה"},
            {"en": "Yitzhak Sadeh", "he": "יצחק שדה"}, {"en": "Rehov Sadeh", "he": "רחוב שדה"},
            {"en": "Yosef Hanasi", "he": "יוסף הנשיא"}, {"en": "Rehov Yosef Hanasi", "he": "רחוב יוסף הנשיא"},
            {"en": "Yoseftal", "he": "יוספטל"}, {"en": "Rehov Yoseftal", "he": "רחוב יוספטל"},
            {"en": "Harav Kook", "he": "הרב קוק"}, {"en": "Rehov Harav Kook", "he": "רחוב הרב קוק"},
            {"en": "Harav Maimon", "he": "הרב מימון"}, {"en": "Rehov Harav Maimon", "he": "רחוב הרב מימון"},
            {"en": "Shimon HaTzadik", "he": "שמעון הצדיק"}, {"en": "Rehov Shimon HaTzadik", "he": "רחוב שמעון הצדיק"},
            {"en": "Ramban", "he": "הרמב״ן"}, {"en": "Rehov Ramban", "he": "רחוב הרמב״ן"},
            {"en": "Ibn Gabirol", "he": "אבן גבירול"}, {"en": "Rehov Ibn Gabirol", "he": "רחוב אבן גבירול"},
            {"en": "Ibn Ezra", "he": "אבן עזרא"}, {"en": "Rehov Ibn Ezra", "he": "רחוב אבן עזרא"},
            {"en": "Yehuda HaLevi", "he": "יהודה הלוי"}, {"en": "Rehov Yehuda HaLevi", "he": "רחוב יהודה הלוי"},
            {"en": "Shlomo Ibn Gabirol", "he": "שלמה אבן גבירול"}, {"en": "Rehov Shlomo Ibn Gabirol", "he": "רחוב שלמה אבן גבירול"},
            {"en": "Nachalat Binyamin", "he": "נחלת בנימין"}, {"en": "Rehov Nachalat Binyamin", "he": "רחוב נחלת בנימין"},
            {"en": "Nachalat", "he": "נחלת"}, {"en": "Rehov Nachalat", "he": "רחוב נחלת"},
            {"en": "Kerem", "he": "כרם"}, {"en": "Rehov Kerem", "he": "רחוב כרם"},
            {"en": "Kerem HaTemanim", "he": "כרם התימנים"}, {"en": "Rehov Kerem HaTemanim", "he": "רחוב כרם התימנים"},
            {"en": "Yad Eliyahu", "he": "יד אליהו"}, {"en": "Rehov Yad Eliyahu", "he": "רחוב יד אליהו"},
            {"en": "Ezra", "he": "עזרא"}, {"en": "Rehov Ezra", "he": "רחוב עזרא"},
            {"en": "Hatikva", "he": "התקווה"}, {"en": "Rehov Hatikva", "he": "רחוב התקווה"},
            {"en": "Giv'at", "he": "גבעת"}, {"en": "Rehov Giv'at", "he": "רחוב גבעת"},
            {"en": "Givat Herzl", "he": "גבעת הרצל"}, {"en": "Rehov Givat Herzl", "he": "רחוב גבעת הרצל"},
            {"en": "Kiryat Shalom", "he": "קרית שלום"}, {"en": "Rehov Kiryat Shalom", "he": "רחוב קרית שלום"},
            {"en": "Ramat Aviv", "he": "רמת אביב"}, {"en": "Rehov Ramat Aviv", "he": "רחוב רמת אביב"},
            {"en": "Ramat Hahayal", "he": "רמת החייל"}, {"en": "Rehov Ramat Hahayal", "he": "רחוב רמת החייל"},
            {"en": "Bavli", "he": "בבלי"}, {"en": "Rehov Bavli", "he": "רחוב בבלי"},
            {"en": "Shikun Dan", "he": "שיכון דן"}, {"en": "Rehov Shikun Dan", "he": "רחוב שיכון דן"},
            {"en": "Yarkon", "he": "ירקון"}, {"en": "Rehov Yarkon", "he": "רחוב ירקון"},
            {"en": "Nachmani", "he": "נחמני"}, {"en": "Rehov Nachmani", "he": "רחוב נחמני"},
            {"en": "Montefiori", "he": "מונטיפיורי"}, {"en": "Rehov Montefiori", "he": "רחוב מונטיפיורי"},
            {"en": "David Elazar", "he": "דוד אלעזר"}, {"en": "Elazar", "he": "אלעזר"}, {"en": "Rehov Elazar", "he": "רחוב אלעזר"},
            {"en": "Haim Bar Lev", "he": "חיים בר לב"}, {"en": "Bar Lev", "he": "בר לב"}, {"en": "Rehov Bar Lev", "he": "רחוב בר לב"},
            {"en": "Bar Ilan", "he": "בר אילן"}, {"en": "Rehov Bar Ilan", "he": "רחוב בר אילן"},
            {"en": "Shimon Peres", "he": "שמעון פרס"}, {"en": "Peres", "he": "פרס"}, {"en": "Rehov Peres", "he": "רחוב פרס"},
            {"en": "Reuven Rivlin", "he": "ראובן ריבלין"}, {"en": "Rivlin", "he": "ריבלין"}, {"en": "Rehov Rivlin", "he": "רחוב ריבלין"},
            {"en": "Ariel Sharon", "he": "אריאל שרון"}, {"en": "Sharon", "he": "שרון"}, {"en": "Rehov Sharon", "he": "רחוב שרון"},
            {"en": "Netanyahu", "he": "נתניהו"}, {"en": "Rehov Netanyahu", "he": "רחוב נתניהו"},
            {"en": "Yitzhak Shamir", "he": "יצחק שמיר"}, {"en": "Shamir", "he": "שמיר"}, {"en": "Rehov Shamir", "he": "רחוב שמיר"},
            {"en": "Ehud Barak", "he": "אהוד ברק"}, {"en": "Barak", "he": "ברק"}, {"en": "Rehov Barak", "he": "רחוב ברק"},
            {"en": "Yair Lapid", "he": "יאיר לפיד"}, {"en": "Lapid", "he": "לפיד"}, {"en": "Rehov Lapid", "he": "רחוב לפיד"},
            {"en": "Chaim Herzog", "he": "חיים הרצוג"}, {"en": "Herzog", "he": "הרצוג"}, {"en": "Rehov Herzog", "he": "רחוב הרצוג"},
            {"en": "Meir Dizengoff", "he": "מאיר דיזנגוף"}, {"en": "Rehov Dizengoff", "he": "רחוב דיזנגוף"},
            {"en": "Chaim Weizmann", "he": "חיים וייצמן"}, {"en": "Haim Weizmann", "he": "חיים וייצמן"}, {"en": "Rehov Weizmann", "he": "רחוב וייצמן"},
            {"en": "Leah Goldberg", "he": "לאה גולדברג"}, {"en": "Rehov Leah Goldberg", "he": "רחוב לאה גולדברג"},
            {"en": "Natan Alterman", "he": "נתן אלתרמן"}, {"en": "Rehov Natan Alterman", "he": "רחוב נתן אלתרמן"},
            {"en": "Goldberg", "he": "גולדברג"}, {"en": "Rehov Goldberg", "he": "רחוב גולדברג"},
            {"en": "Greenberg", "he": "גרינברג"}, {"en": "Rehov Greenberg", "he": "רחוב גרינברג"},
            {"en": "Shenkar", "he": "שנקר"}, {"en": "Rehov Shenkar", "he": "רחוב שנקר"},
            {"en": "Shlonsky", "he": "שלונסקי"}, {"en": "Rehov Shlonsky", "he": "רחוב שלונסקי"},
            {"en": "Frishman", "he": "פרישמן"}, {"en": "Rehov Frishman", "he": "רחוב פרישמן"},
            {"en": "Frug", "he": "פרוג"}, {"en": "Rehov Frug", "he": "רחוב פרוג"},
            {"en": "Pinsker", "he": "פינסקר"}, {"en": "Rehov Pinsker", "he": "רחוב פינסקר"},
            {"en": "Lilienblum", "he": "לילינבלום"}, {"en": "Rehov Lilienblum", "he": "רחוב לילינבלום"},
            {"en": "Smolenskin", "he": "מולנסקין"}, {"en": "Rehov Smolenskin", "he": "רחוב סמולנסקין"},
            {"en": "Mapu", "he": "מאפו"}, {"en": "Rehov Mapu", "he": "רחוב מאפו"},
            {"en": "Mendele", "he": "מנדלי"}, {"en": "Rehov Mendele", "he": "רחוב מנדלי"},
            {"en": "Kaplan", "he": "קפלן"}, {"en": "Rehov Kaplan", "he": "רחוב קפלן"},
            {"en": "Hamasger", "he": "המסגר"}, {"en": "Rehov Hamasger", "he": "רחוב המסגר"},
            {"en": "Harakevet", "he": "הרכבת"}, {"en": "Rehov Harakevet", "he": "רחוב הרכבת"},
            {"en": "Salame", "he": "סלמה"}, {"en": "Rehov Salame", "he": "רחוב סלמה"},
            {"en": "Usishkin", "he": "אוסישקין"}, {"en": "Menachem Usishkin", "he": "מנחם אוסישקין"}, {"en": "Rehov Usishkin", "he": "רחוב אוסישקין"},
            {"en": "Bnei Dan", "he": "בני דן"}, {"en": "Rehov Bnei Dan", "he": "רחוב בני דן"},
            {"en": "Kibbutz Galuyot", "he": "קיבוץ גלויות"}, {"en": "Rehov Kibbutz Galuyot", "he": "רחוב קיבוץ גלויות"},
            {"en": "La Guardia", "he": "לה גוארדיה"}, {"en": "Rehov La Guardia", "he": "רחוב לה גוארדיה"},
            {"en": "Lincoln", "he": "לינקולן"}, {"en": "Rehov Lincoln", "he": "רחוב לינקולן"},
            {"en": "Meir", "he": "מאיר"}, {"en": "Rehov Meir", "he": "רחוב מאיר"},
            {"en": "Michael", "he": "מיכאל"}, {"en": "Rehov Michael", "he": "רחוב מיכאל"},
            {"en": "Masada", "he": "מסדה"}, {"en": "Rehov Masada", "he": "רחוב מסדה"},
            {"en": "Moshe Dayan", "he": "משה דיין"}, {"en": "Dayan", "he": "דיין"}, {"en": "Rehov Dayan", "he": "רחוב דיין"},
            {"en": "Nahariya", "he": "נהריה"}, {"en": "Rehov Nahariya", "he": "רחוב נהריה"},
            {"en": "Remez", "he": "רמז"}, {"en": "Rehov Remez", "he": "רחוב רמז"},
            {"en": "Shazar", "he": "שז״ר"}, {"en": "Rehov Shazar", "he": "רחוב שז״ר"},
            {"en": "Sirkin", "he": "סירקין"}, {"en": "Rehov Sirkin", "he": "רחוב סירקין"},
            {"en": "Katznelson", "he": "קצנלסון"}, {"en": "Rehov Katznelson", "he": "רחוב קצנלסון"},
            {"en": "Katz", "he": "כץ"}, {"en": "Rehov Katz", "he": "רחוב כץ"},
            {"en": "Cohen", "he": "כהן"}, {"en": "Rehov Cohen", "he": "רחוב כהן"},
            {"en": "Bloch", "he": "בלוך"}, {"en": "Rehov Bloch", "he": "רחוב בלוך"},
            {"en": "Stricker", "he": "שטריקר"}, {"en": "Rehov Stricker", "he": "רחוב שטריקר"},
            {"en": "Wolfson", "he": "וולפסון"}, {"en": "Rehov Wolfson", "he": "רחוב וולפסון"},
            {"en": "Brenner", "he": "ברנר"}, {"en": "Rehov Brenner", "he": "רחוב ברנר"},
            {"en": "Yoel Cohen", "he": "יואל כהן"}, {"en": "Rehov Yoel Cohen", "he": "רחוב יואל כהן"},
            {"en": "Chana Michael Levin", "he": "חנה ומיכאל לוין"}, {"en": "Rehov Chana Michael Levin", "he": "רחוב חנה ומיכאל לוין"},
            {"en": "Machali Halevi", "he": "מחלי הלוי"}, {"en": "Rehov Machali Halevi", "he": "רחוב מחלי הלוי"},
            {"en": "Sheinkin", "he": "שינקין"}, {"en": "Rehov Sheinkin", "he": "רחוב שינקין"},
            {"en": "Allenby", "he": "אלנבי"}, {"en": "Rehov Allenby", "he": "רחוב אלנבי"},
            {"en": "Jaffa", "he": "יפו"}, {"en": "Yaffo", "he": "יפו"}, {"en": "Yafo", "he": "יפו"}, {"en": "Rehov Jaffa", "he": "רחוב יפו"},
            {"en": "Dizengoff", "he": "דיזנגוף"}, {"en": "Rehov Dizengoff", "he": "רחוב דיזנגוף"},
            {"en": "King George", "he": "קינג ג'ורג'"}, {"en": "Rehov King George", "he": "רחוב קינג ג'ורג'"},
            {"en": "Yehuda Halevi", "he": "יהודה הלוי"}, {"en": "Rehov Yehuda Halevi", "he": "רחוב יהודה הלוי"},
            {"en": "Ben Yehuda", "he": "בן יהודה"}, {"en": "Rehov Ben Yehuda", "he": "רחוב בן יהודה"},
            {"en": "Nachalat Binyamin", "he": "נחלת בנימין"}, {"en": "Rehov Nachalat Binyamin", "he": "רחוב נחלת בנימין"},
            {"en": "Derech Hebron", "he": "דרך חברון"}, {"en": "Rehov Derech Hebron", "he": "רחוב דרך חברון"},
            {"en": "Derech Jaffa", "he": "דרך יפו"}, {"en": "Rehov Derech Jaffa", "he": "רחוב דרך יפו"},
            {"en": "Derech Ben Gurion", "he": "דרך בן גוריון"}, {"en": "Rehov Derech Ben Gurion", "he": "רחוב דרך בן גוריון"},
            {"en": "Derech Herzl", "he": "דרך הרצל"}, {"en": "Rehov Derech Herzl", "he": "רחוב דרך הרצל"},
            {"en": "Derech Shalom", "he": "דרך שלום"}, {"en": "Rehov Derech Shalom", "he": "רחוב דרך שלום"},
            {"en": "Derech Yerushalayim", "he": "דרך ירושלים"}, {"en": "Derech Jerusalem", "he": "דרך ירושלים"}, {"en": "Rehov Derech Yerushalayim", "he": "רחוב דרך ירושלים"},
            {"en": "Derech Heil", "he": "דרך חיל"}, {"en": "Rehov Derech Heil", "he": "רחוב דרך חיל"},
            {"en": "Derech Holon", "he": "דרך חולון"}, {"en": "Rehov Derech Holon", "he": "רחוב דרך חולון"},
            {"en": "Derech Rehovot", "he": "דרך רחובות"}, {"en": "Rehov Derech Rehovot", "he": "רחוב דרך רחובות"},
            {"en": "Derech Nes Ziona", "he": "דרך נס ציונה"}, {"en": "Rehov Derech Nes Ziona", "he": "רחוב דרך נס ציונה"},
            {"en": "Derech Ramat Gan", "he": "דרך רמת גן"}, {"en": "Rehov Derech Ramat Gan", "he": "רחוב דרך רמת גן"},
            {"en": "Derech Eilat", "he": "דרך אילת"}, {"en": "Rehov Derech Eilat", "he": "רחוב דרך אילת"},
            {"en": "Derech Begin", "he": "דרך בגין"}, {"en": "Rehov Derech Begin", "he": "רחוב דרך בגין"},
            {"en": "Derech HaDarom", "he": "דרך הדרום"}, {"en": "Rehov Derech HaDarom", "he": "רחוב דרך הדרום"},
            {"en": "Derech HaShalom", "he": "דרך השלום"}, {"en": "Rehov Derech HaShalom", "he": "רחוב דרך השלום"},
            {"en": "Derech Haifa", "he": "דרך חיפה"}, {"en": "Rehov Derech Haifa", "he": "רחוב דרך חיפה"},
            {"en": "Derech Lakish", "he": "דרך לכיש"}, {"en": "Rehov Derech Lakish", "he": "רחוב דרך לכיש"},
            {"en": "Derech Tel Aviv", "he": "דרך תל אביב"}, {"en": "Rehov Derech Tel Aviv", "he": "רחוב דרך תל אביב"},
            {"en": "Derech Menachem Begin", "he": "דרך מנחם בגין"}, {"en": "Rehov Derech Menachem Begin", "he": "רחוב דרך מנחם בגין"},
            {"en": "Derech Namir", "he": "דרך נמיר"}, {"en": "Rehov Derech Namir", "he": "רחוב דרך נמיר"},
            {"en": "Derech Petach Tikva", "he": "דרך פתח תקווה"}, {"en": "Rehov Derech Petach Tikva", "he": "רחוב דרך פתח תקווה"},
            {"en": "Sderot Rothschild", "he": "שדרות רוטשילד"}, {"en": "Rehov Sderot Rothschild", "he": "רחוב שדרות רוטשילד"},
            {"en": "Sderot Yerushalayim", "he": "שדרות ירושלים"}, {"en": "Rehov Sderot Yerushalayim", "he": "רחוב שדרות ירושלים"},
            {"en": "Sderot Ben Gurion", "he": "שדרות בן גוריון"}, {"en": "Rehov Sderot Ben Gurion", "he": "רחוב שדרות בן גוריון"},
            {"en": "Sderot Herzl", "he": "שדרות הרצל"}, {"en": "Rehov Sderot Herzl", "he": "רחוב שדרות הרצל"},
            {"en": "Sderot Weizmann", "he": "שדרות ויצמן"}, {"en": "Rehov Sderot Weizmann", "he": "רחוב שדרות ויצמן"},
            {"en": "Sderot Chen", "he": "שדרות חן"}, {"en": "Rehov Sderot Chen", "he": "רחוב שדרות חן"},
            {"en": "Sderot Yehudit", "he": "שדרות יהודית"}, {"en": "Rehov Sderot Yehudit", "he": "רחוב שדרות יהודית"},
            {"en": "Rothschild Boulevard", "he": "שדרות רוטשילד"}, {"en": "Rothschild Blvd", "he": "שדרות רוטשילד"},
            {"en": "Chen Boulevard", "he": "שדרות חן"}, {"en": "Chen Blvd", "he": "שדרות חן"},
            {"en": "Shaul HaMelech Boulevard", "he": "שדרות שאול המלך"}, {"en": "Rehov Shaul HaMelech Boulevard", "he": "רחוב שדרות שאול המלך"},
            {"en": "Rabin Square", "he": "כיכר רבין"}, {"en": "Kikar Rabin", "he": "כיכר רבין"},
            {"en": "Dizengoff Square", "he": "כיכר דיזנגוף"}, {"en": "Kikar Dizengoff", "he": "כיכר דיזנגוף"},
            {"en": "Kikar Hamedina", "he": "כיכר המדינה"}, {"en": "State Square", "he": "כיכר המדינה"},
            {"en": "Yarkon Park", "he": "פארק הירקון"}, {"en": "HaYarkon Park", "he": "פארק הירקון"},
            {"en": "Carmel Market", "he": "שוק הכרמל"}, {"en": "Shuk HaCarmel", "he": "שוק הכרמל"},
            {"en": "Levinsky Market", "he": "שוק לבינסקי"}, {"en": "Shuk Levinsky", "he": "שוק לבינסקי"},
            {"en": "Mahane Yehuda", "he": "מחנה יהודה"}, {"en": "Rehov Mahane Yehuda", "he": "רחוב מחנה יהודה"},
            {"en": "Old Jaffa", "he": "יפו העתיקה"}, {"en": "Yafo HaAtika", "he": "יפו העתיקה"},
            {"en": "Neve Tzedek", "he": "נווה צדק"}, {"en": "Rehov Neve Tzedek", "he": "רחוב נווה צדק"},
            {"en": "Florentine", "he": "פלורנטין"}, {"en": "Rehov Florentine", "he": "רחוב פלורנטין"},
            {"en": "Shapira", "he": "שפירא"}, {"en": "Rehov Shapira", "he": "רחוב שפירא"},
            {"en": "Ben Sira", "he": "בן סירא"}, {"en": "Rehov Ben Sira", "he": "רחוב בן סירא"},
            {"en": "Ben Zvi", "he": "בן צבי"}, {"en": "Rehov Ben Zvi", "he": "רחוב בן צבי"},
            {"en": "Ben Shemen", "he": "בן שמן"}, {"en": "Rehov Ben Shemen", "he": "רחוב בן שמן"},
            {"en": "Ben Ammi", "he": "בן עמי"}, {"en": "Rehov Ben Ammi", "he": "רחוב בן עמי"},
            {"en": "Ben Tzvi", "he": "בן צבי"}, {"en": "Rehov Ben Tzvi", "he": "רחוב בן צבי"},
            {"en": "Bar Giora", "he": "בר גיורא"}, {"en": "Rehov Bar Giora", "he": "רחוב בר גיורא"},
            {"en": "Bar Yochai", "he": "בר יוחאי"}, {"en": "Rehov Bar Yochai", "he": "רחוב בר יוחאי"},
            {"en": "Tzahala", "he": "צהלה"}, {"en": "Rehov Tzahala", "he": "רחוב צהלה"},
            {"en": "Ramat Aviv Gimmel", "he": "רמת אביב ג"}, {"en": "Rehov Ramat Aviv Gimmel", "he": "רחוב רמת אביב ג"},
            {"en": "Ramat Aviv Alef", "he": "רמת אביב א"}, {"en": "Rehov Ramat Aviv Alef", "he": "רחוב רמת אביב א"},
            {"en": "Ramat Aviv Bet", "he": "רמת אביב ב"}, {"en": "Rehov Ramat Aviv Bet", "he": "רחוב רמת אביב ב"},
            {"en": "Ramat Gan", "he": "רמת גן"}, {"en": "Rehov Ramat Gan", "he": "רחוב רמת גן"},
            {"en": "Ramat HaSharon", "he": "רמת השרון"}, {"en": "Rehov Ramat HaSharon", "he": "רחוב רמת השרון"},
            {"en": "Tel Aviv", "he": "תל אביב"}, {"en": "Rehov Tel Aviv", "he": "רחוב תל אביב"},
            {"en": "Tel Hai", "he": "תל חי"}, {"en": "Rehov Tel Hai", "he": "רחוב תל חי"},
            {"en": "Haifa", "he": "חיפה"}, {"en": "Rehov Haifa", "he": "רחוב חיפה"},
            {"en": "Jerusalem", "he": "ירושלים"}, {"en": "Yerushalayim", "he": "ירושלים"}, {"en": "Rehov Jerusalem", "he": "רחוב ירושלים"},
            {"en": "Beer Sheva", "he": "באר שבע"}, {"en": "Be'er Sheva", "he": "באר שבע"}, {"en": "Rehov Beer Sheva", "he": "רחוב באר שבע"},
            {"en": "Netanya", "he": "נתניה"}, {"en": "Rehov Netanya", "he": "רחוב נתניה"},
            {"en": "Petah Tikva", "he": "פתח תקווה"}, {"en": "Petach Tikva", "he": "פתח תקווה"}, {"en": "Rehov Petah Tikva", "he": "רחוב פתח תקווה"},
            {"en": "Holon", "he": "חולון"}, {"en": "Rehov Holon", "he": "רחוב חולון"},
            {"en": "Bnei Brak", "he": "בני ברק"}, {"en": "Rehov Bnei Brak", "he": "רחוב בני ברק"},
            {"en": "Ashdod", "he": "אשדוד"}, {"en": "Rehov Ashdod", "he": "רחוב אשדוד"},
            {"en": "Ashkelon", "he": "אשקלון"}, {"en": "Rehov Ashkelon", "he": "רחוב אשקלון"},
            {"en": "Nes Ziona", "he": "נס ציונה"}, {"en": "Nes Tziona", "he": "נס ציונה"}, {"en": "Rehov Nes Ziona", "he": "רחוב נס ציונה"},
            {"en": "Rehovot", "he": "רחובות"}, {"en": "Rehov Rehovot", "he": "רחוב רחובות"},
            {"en": "Gedera", "he": "גדרה"}, {"en": "Rehov Gedera", "he": "רחוב גדרה"},
            {"en": "Yavne", "he": "יבנה"}, {"en": "Rehov Yavne", "he": "רחוב יבנה"},
            {"en": "Gan Yavne", "he": "גן יבנה"}, {"en": "Rehov Gan Yavne", "he": "רחוב גן יבנה"},
            {"en": "Shoham", "he": "שוהם"}, {"en": "Rehov Shoham", "he": "רחוב שוהם"},
            {"en": "Modi'in", "he": "מודיעין"}, {"en": "Modiin", "he": "מודיעין"}, {"en": "Rehov Modi'in", "he": "רחוב מודיעין"},
            {"en": "Kiryat Ono", "he": "קרית אונו"}, {"en": "Rehov Kiryat Ono", "he": "רחוב קרית אונו"},
            {"en": "Or Yehuda", "he": "אור יהודה"}, {"en": "Rehov Or Yehuda", "he": "רחוב אור יהודה"},
            {"en": "Givat Shmuel", "he": "גבעת שמואל"}, {"en": "Rehov Givat Shmuel", "he": "רחוב גבעת שמואל"},
            {"en": "Bat Yam", "he": "בת ים"}, {"en": "Rehov Bat Yam", "he": "רחוב בת ים"},
            {"en": "Azur", "he": "אזור"}, {"en": "Azor", "he": "אזור"}, {"en": "Rehov Azur", "he": "רחוב אזור"},
            {"en": "Kfar Sava", "he": "כפר סבא"}, {"en": "Kfar Saba", "he": "כפר סבא"}, {"en": "Rehov Kfar Sava", "he": "רחוב כפר סבא"},
            {"en": "Hod Hasharon", "he": "הוד השרון"}, {"en": "Rehov Hod Hasharon", "he": "רחוב הוד השרון"},
            {"en": "Rosh HaAyin", "he": "ראש העין"}, {"en": "Rehov Rosh HaAyin", "he": "רחוב ראש העין"},
            {"en": "Lod", "he": "לוד"}, {"en": "Rehov Lod", "he": "רחוב לוד"},
            {"en": "Ramla", "he": "רמלה"}, {"en": "Rehov Ramla", "he": "רחוב רמלה"},
            {"en": "Yehud", "he": "יהוד"}, {"en": "Rehov Yehud", "he": "רחוב יהוד"},
            {"en": "Yehud Monosson", "he": "יהוד מונוסון"}, {"en": "Rehov Yehud Monosson", "he": "רחוב יהוד מונוסון"},
            {"en": "Beit Dagan", "he": "בית דגן"}, {"en": "Rehov Beit Dagan", "he": "רחוב בית דגן"},
            {"en": "Kiryat Gat", "he": "קרית גת"}, {"en": "Rehov Kiryat Gat", "he": "רחוב קרית גת"},
            {"en": "Kiryat Motzkin", "he": "קרית מוצקין"}, {"en": "Rehov Kiryat Motzkin", "he": "רחוב קרית מוצקין"},
            {"en": "Kiryat Yam", "he": "קרית ים"}, {"en": "Rehov Kiryat Yam", "he": "רחוב קרית ים"},
            {"en": "Kiryat Bialik", "he": "קרית ביאליק"}, {"en": "Rehov Kiryat Bialik", "he": "רחוב קרית ביאליק"},
            {"en": "Kiryat Haim", "he": "קרית חיים"}, {"en": "Rehov Kiryat Haim", "he": "רחוב קרית חיים"},
            {"en": "Kiryat Malachi", "he": "קרית מלאכי"}, {"en": "Rehov Kiryat Malachi", "he": "רחוב קרית מלאכי"},
            {"en": "Kiryat Ekron", "he": "קרית עקרון"}, {"en": "Rehov Kiryat Ekron", "he": "רחוב קרית עקרון"},
            {"en": "Kiryat Shmona", "he": "קרית שמונה"}, {"en": "Rehov Kiryat Shmona", "he": "רחוב קרית שמונה"},
            {"en": "Kiryat Shalom", "he": "קרית שלום"}, {"en": "Rehov Kiryat Shalom", "he": "רחוב קרית שלום"},
            {"en": "Kiryat Ono", "he": "קרית אונו"}, {"en": "Rehov Kiryat Ono", "he": "רחוב קרית אונו"},
            {"en": "Hadera", "he": "חדרה"}, {"en": "Rehov Hadera", "he": "רחוב חדרה"},
            {"en": "Caesarea", "he": "קיסריה"}, {"en": "Rehov Caesarea", "he": "רחוב קיסריה"},
            {"en": "Zichron Ya'akov", "he": "זכרון יעקב"}, {"en": "Zichron Yaakov", "he": "זכרון יעקב"}, {"en": "Rehov Zichron Ya'akov", "he": "רחוב זכרון יעקב"},
            {"en": "Binyamina", "he": "בנימינה"}, {"en": "Rehov Binyamina", "he": "רחוב בנימינה"},
            {"en": "Pardes Hanna", "he": "פרדס חנה"}, {"en": "Rehov Pardes Hanna", "he": "רחוב פרדס חנה"},
            {"en": "Or Akiva", "he": "אור עקיבא"}, {"en": "Rehov Or Akiva", "he": "רחוב אור עקיבא"},
            {"en": "Yokne'am", "he": "יקנעם"}, {"en": "Rehov Yokne'am", "he": "רחוב יקנעם"},
            {"en": "Afula", "he": "עפולה"}, {"en": "Rehov Afula", "he": "רחוב עפולה"},
            {"en": "Beit Shean", "he": "בית שאן"}, {"en": "Beit She'an", "he": "בית שאן"}, {"en": "Rehov Beit Shean", "he": "רחוב בית שאן"},
            {"en": "Carmiel", "he": "כרמיאל"}, {"en": "Rehov Carmiel", "he": "רחוב כרמיאל"},
            {"en": "Ma'alot", "he": "מעלות"}, {"en": "Rehov Ma'alot", "he": "רחוב מעלות"},
            {"en": "Akko", "he": "עכו"}, {"en": "Acre", "he": "עכו"}, {"en": "Rehov Akko", "he": "רחוב עכו"},
            {"en": "Tiberias", "he": "טבריה"}, {"en": "Tverya", "he": "טבריה"}, {"en": "Rehov Tiberias", "he": "רחוב טבריה"},
            {"en": "Tzfat", "he": "צפת"}, {"en": "Safed", "he": "צפת"}, {"en": "Rehov Tzfat", "he": "רחוב צפת"},
            {"en": "Eilat", "he": "אילת"}, {"en": "Rehov Eilat", "he": "רחוב אילת"},
            {"en": "Mitzpe Ramon", "he": "מצפה רמון"}, {"en": "Rehov Mitzpe Ramon", "he": "רחוב מצפה רמון"},
            {"en": "Dimona", "he": "דימונה"}, {"en": "Rehov Dimona", "he": "רחוב דימונה"},
            {"en": "Arad", "he": "ערד"}, {"en": "Rehov Arad", "he": "רחוב ערד"},
            {"en": "Sderot", "he": "שדרות"}, {"en": "Rehov Sderot", "he": "רחוב שדרות"},
            {"en": "Ofakim", "he": "אופקים"}, {"en": "Rehov Ofakim", "he": "רחוב אופקים"},
            {"en": "Netivot", "he": "נתיבות"}, {"en": "Rehov Netivot", "he": "רחוב נתיבות"}
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

        // Pattern: Match 1-3 words + number (Hebrew OR English)
        // Building number: 1-3 digits, optionally apartment (e.g., "26/4")
        val addressPattern = Regex("([א-תa-zA-Z]+(?:\\s+[א-תa-zA-Z]+){0,2})\\s+(\\d{1,3}(?:[/\\s]\\d{1,2})?)")
        
        // Zip code pattern: pure numeric, 4-7 digits (Israeli zip codes)
        val zipCodePattern = Regex("^\\d{4,7}$")
        // Zip code embedded in text (e.g., "Street 7539411 IL")
        val embeddedZipPattern = Regex("\\b(\\d{4,7})\\b")

        // ML Kit often returns multi-line blocks with garbage + address
        // Try matching EACH LINE separately to extract clean addresses
        val lines = text.split("\n").map { it.trim() }.filter { it.isNotEmpty() }

        // First pass: identify zip code lines and collect all potential address matches
        val zipCodeIndices = mutableSetOf<Int>()
        val addressCandidates = mutableListOf<Pair<Int, String>>() // (lineIndex, address)

        for ((index, line) in lines.withIndex()) {
            Log.d("ADDRESS_DEBUG", "  🔍 Line $index: '$line'")

            // Check if this is a zip code (pure numeric, 4-7 digits)
            if (zipCodePattern.matches(line)) {
                zipCodeIndices.add(index)
                Log.d("ADDRESS_DEBUG", "    📮 Identified as ZIP CODE at index $index")
                continue
            }

            // Check for embedded zip codes in the line (e.g., "Street 7539411 IL")
            val embeddedZipMatch = embeddedZipPattern.find(line)
            if (embeddedZipMatch != null) {
                val zipCode = embeddedZipMatch.groupValues[1]
                zipCodeIndices.add(index)
                Log.d("ADDRESS_DEBUG", "    📮 Found embedded ZIP CODE '$zipCode' at index $index")
                // Continue to check if there's also an address on this line
            }

            // SKIP lines that are mostly numbers (zip codes, tracking numbers)
            val digitCount = line.count { it.isDigit() }
            val totalChars = line.length
            if (totalChars > 0 && digitCount.toDouble() / totalChars > 0.6) {
                Log.d("ADDRESS_DEBUG", "    ❌ Line is mostly numbers (${(digitCount.toDouble() / totalChars * 100).toInt()}%), skipping")
                continue
            }

            val match = addressPattern.find(line)

            if (match == null) {
                Log.d("ADDRESS_DEBUG", "    ❌ No pattern match")
                continue
            }

            val streetPart = match.groupValues[1].trim()
            val numberPart = match.groupValues[2].trim()

            // Check if the matched number is actually part of a zip code
            // Look for zip codes (4-7 digits) near the matched number
            val numberStartPos = match.range.last - numberPart.length + 1
            val contextAfter = line.substring(minOf(numberStartPos + numberPart.length, line.length))
            val zipCodeAfter = embeddedZipPattern.find(contextAfter)
            
            if (zipCodeAfter != null) {
                val zipCode = zipCodeAfter.groupValues[1]
                // Check if our matched number overlaps with or is part of the zip code
                val matchedNumberDigits = numberPart.filter { it.isDigit() }
                if (zipCode.startsWith(matchedNumberDigits) && zipCode.length >= 4) {
                    Log.d("ADDRESS_DEBUG", "    ❌ Matched number '$numberPart' is part of zip code '$zipCode', rejecting")
                    continue
                }
            }

            // REJECT if building number is too large (likely a zip code or tracking number)
            val buildingNumber = numberPart.split("/", " ")[0].toIntOrNull()
            if (buildingNumber != null && buildingNumber > 999) {
                Log.d("ADDRESS_DEBUG", "    ❌ Building number too large ($buildingNumber), likely zip code")
                continue
            }

            // Additional check: if line contains a zip code (4-7 digits), reject this match
            // unless the number is clearly separated (not part of the zip)
            if (embeddedZipMatch != null) {
                val zipCode = embeddedZipMatch.groupValues[1]
                val matchedNumberDigits = numberPart.filter { it.isDigit() }
                // If the matched number digits appear at the start of the zip code, it's likely wrong
                if (zipCode.startsWith(matchedNumberDigits) && matchedNumberDigits.length >= 3) {
                    Log.d("ADDRESS_DEBUG", "    ❌ Number '$numberPart' appears to be start of zip code '$zipCode', rejecting")
                    continue
                }
            }

            if (streetPart.length < 3) {
                Log.d("ADDRESS_DEBUG", "    ❌ Street too short (<3 chars)")
                continue
            }

            // Try fuzzy matching to translate English → Hebrew
            var finalStreetName = streetPart  // Default: use OCR text as-is
            var confidence = 0.0

            if (streetsList.isNotEmpty()) {
                val fuzzyResult = findClosestStreet(streetPart)
                if (fuzzyResult != null && fuzzyResult.second >= 80.0) {
                    // Match found with high confidence! Use Hebrew translation
                    finalStreetName = fuzzyResult.first
                    confidence = fuzzyResult.second
                    Log.d("ADDRESS_DEBUG", "    🔍 Fuzzy match: '$streetPart' → '$finalStreetName' (${confidence.toInt()}%)")
                } else {
                    // No match or low confidence - keep English OCR text
                    val confidenceInfo = if (fuzzyResult != null) " (${fuzzyResult.second.toInt()}% - too low)" else ""
                    Log.d("ADDRESS_DEBUG", "    ℹ️ Keeping English: '$streetPart'$confidenceInfo")
                }
            }

            val detectedAddress = "$finalStreetName $numberPart"
            addressCandidates.add(Pair(index, detectedAddress))
            Log.d("ADDRESS_DEBUG", "    ✅ Address candidate at index $index: '$detectedAddress'")
        }

        // Now select the best address
        var selectedAddress: String? = null

        // Strategy 1: If we found zip codes, prioritize the line ABOVE the first zip code
        if (zipCodeIndices.isNotEmpty()) {
            val firstZipIndex = zipCodeIndices.minOrNull()!!
            Log.d("ADDRESS_DEBUG", "📮 Found zip code at index $firstZipIndex, looking for address above it")
            
            // Find address candidate immediately before the zip code
            val addressAboveZip = addressCandidates.findLast { it.first < firstZipIndex }
            if (addressAboveZip != null) {
                selectedAddress = addressAboveZip.second
                Log.d("ADDRESS_DEBUG", "✅ Selected address above zip code: '$selectedAddress' (index ${addressAboveZip.first})")
            } else {
                // If no address found above, try the line before zip (might be in a different format)
                if (firstZipIndex > 0) {
                    val lineAboveZip = lines[firstZipIndex - 1]
                    // Check if it looks like an address (has text and numbers)
                    val textChars = lineAboveZip.count { it.isLetter() || (it.code in 0x0590..0x05FF) } // Hebrew Unicode range
                    val numChars = lineAboveZip.count { it.isDigit() }
                    if (textChars >= 3 && numChars > 0 && numChars <= 5) {
                        selectedAddress = lineAboveZip
                        Log.d("ADDRESS_DEBUG", "✅ Using line above zip code as address: '$selectedAddress'")
                    }
                }
            }
        }

        // Strategy 2: If no zip code found or no address above zip, use the best candidate
        if (selectedAddress == null && addressCandidates.isNotEmpty()) {
            // Prefer candidates with more text (better address quality)
            selectedAddress = addressCandidates.maxByOrNull { candidate ->
                val textRatio = candidate.second.count { it.isLetter() || (it.code in 0x0590..0x05FF) }.toDouble() / candidate.second.length
                textRatio
            }?.second
            
            Log.d("ADDRESS_DEBUG", "✅ Selected best address candidate: '$selectedAddress'")
        }

        // Update last detected address with confirmation logic (similar to phone numbers)
        if (selectedAddress != null && confirmedAddress == null) {
            // Check if this matches the previously detected address
            if (lastDetectedAddress == selectedAddress) {
                // Same address detected again - increment count
                addressDetectionCount++
                Log.d("ADDRESS_SCAN", "✅ MATCH! Same address again: '$selectedAddress' (count now: $addressDetectionCount/4)")

                // Confirm address after 4 consecutive detections
                if (addressDetectionCount >= 4) {
                    confirmedAddress = selectedAddress
                    Log.d("ADDRESS_SCAN", "✅ 🏠 Address CONFIRMED: $selectedAddress")
                }
            } else {
                // Different address detected - reset and start over
                lastDetectedAddress = selectedAddress
                addressDetectionCount = 1
                Log.d("ADDRESS_SCAN", "🆕 New address detected: '$selectedAddress' (count reset to 1)")
            }
        } else if (selectedAddress == null) {
            Log.d("ADDRESS_DEBUG", "❌ No valid address found in any line")
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
            addressDetectionCount = 0
            Log.d("SCAN", "🆕 New number detected: $normalized (count reset to 1, address cleared)")
        } else {
            detectionCount++
            Log.d("SCAN", "✅ MATCH! Same number again: $normalized (count now: $detectionCount)")
        }

        runOnUiThread {
            val display = formatForDisplay(normalized)
            tvDetected.text = "$display (${detectionCount}/2)"
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
            runOnUiThread {
                tvDetected.text = "$confirmedDisplay"
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
        addressDetectionCount = 0
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
