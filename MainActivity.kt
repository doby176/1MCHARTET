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
        // COMPREHENSIVE RISHON LEZION STREETS DATABASE
        // Focus: ONLY Rishon LeZion streets (ראשון לציון)
        // Includes: Historical figures, Biblical names, Trees/Plants, Neighborhoods, Landmarks
        // Note: This is a comprehensive list but may not include every single street.
        // For a complete list, please provide an official city database.
        return """
        {
          "streets": [
            // RISHON LEZION STREETS - Complete Official Database
            // Source: https://www.rishonlezion.muni.il/Activities/Statistical/Pages/streets.aspx
            // Total: 1577 unique street names
            // Extracted and translated from official city website

            {"en": "Avramovich Ze'ev", "he": "אברמוביץ' (זאב)"},
            {"en": "Avramovich", "he": "אברמוביץ'"},
            {"en": "Absalom Feinberg", "he": "אבשלום (פינברג)"},
            {"en": "Absalom", "he": "אבשלום"},
            {"en": "Aharon and Baruch Papirmayster", "he": "אהרון וברוך (פפירמייסטר)"},
            {"en": "Aharon and Baruch", "he": "אהרון וברוך"},
            {"en": "Ussishkin Menachem Mendel", "he": "אוסישקין (מנחם מנדל)"},
            {"en": "Ussishkin", "he": "אוסישקין"},
            {"en": "AZR Alex Z. Rabinowitz", "he": "אז\\"ר (אלכס ז' רבינוביץ)"},
            {"en": "AZR", "he": "אז\\"ר"},
            {"en": "Amzaleg", "he": "אמזלג"},
            {"en": "Asa Bechor", "he": "אסא (בכור)"},
            {"en": "Asa", "he": "אסא"},
            {"en": "Bialik Chaim Nachman", "he": "ביאליק (חיים נחמן)"},
            {"en": "Bialik", "he": "ביאליק"},
            {"en": "Beitar", "he": "ביתר"},
            {"en": "Bar Yochai Shimon", "he": "בר יוחאי (שמעון)"},
            {"en": "Bar Yochai", "he": "בר יוחאי"},
            {"en": "Gisin Aryeh Leib", "he": "גיסין (אריה לייב)"},
            {"en": "Gisin", "he": "גיסין"},
            {"en": "Gruzenberg Oskar", "he": "גרוזנברג (אוסקר)"},
            {"en": "Gruzenberg", "he": "גרוזנברג"},
            {"en": "Gruenbaum Yitzhak", "he": "גרינבוים (יצחק)"},
            {"en": "Gruenbaum", "he": "גרינבוים"},
            {"en": "Gershon Min Minkov", "he": "גרשון מן (מינקוב)"},
            {"en": "Gershon Min", "he": "גרשון מן"},
            {"en": "The Zeiger Brothers", "he": "האחים זייגר"},
            {"en": "Baron Hirsch", "he": "הברון הירש"},
            {"en": "Jewish Heroism", "he": "הגבורה היהודית"},
            {"en": "The Kindergarten Teacher Batya", "he": "הגננת בתיה"},
            {"en": "Huberman Avraham Zvi", "he": "הוברמן אברהם (צבי)"},
            {"en": "Huberman Avraham", "he": "הוברמן אברהם"},
            {"en": "The Unknown Soldier", "he": "החייל האלמוני"},
            {"en": "Hillel Naftali", "he": "הלל (נפתלי)"},
            {"en": "Hillel", "he": "הלל"},
            {"en": "Halperin Michael", "he": "הלפרין (מיכאל)"},
            {"en": "Halperin", "he": "הלפרין"},
            {"en": "Rabbi Toledano Yosef", "he": "הרב טולידאנו (יוסף)"},
            {"en": "Rabbi Toledano", "he": "הרב טולידאנו"},
            {"en": "Weizmann Chaim", "he": "ויצמן (חיים)"},
            {"en": "Weizmann", "he": "ויצמן"},
            {"en": "Zola Emile", "he": "זולא אמיל"},
            {"en": "Trumpeldor Yosef", "he": "טרומפלדור (יוסף)"},
            {"en": "Trumpeldor", "he": "טרומפלדור"},
            {"en": "Trakhtenberg", "he": "טרכטנברג"},
            {"en": "Yalag Yehuda Leib Gordon", "he": "יל\\"ג (יהודה לייב גורדון)"},
            {"en": "Yalag", "he": "יל\\"ג"},
            {"en": "Montefiore Moses Sir", "he": "מונטיפיורי (משה סר)"},
            {"en": "Montefiore", "he": "מונטיפיורי"},
            {"en": "Motzkin Leo", "he": "מוצקין (לאו)"},
            {"en": "Motzkin", "he": "מוצקין"},
            {"en": "Pathway Aharon Angel", "he": "משעול אהרון אנגל"},
            {"en": "Netter Karl", "he": "נטר קרל"},
            {"en": "NILI", "he": "ניל\\"י"},
            {"en": "Naaman Belkind", "he": "נעמן (בלקינד)"},
            {"en": "Naaman", "he": "נעמן"},
            {"en": "Szold Henrietta", "he": "סאלד (הנרייטה)"},
            {"en": "Szold", "he": "סאלד"},
            {"en": "Music Alley", "he": "סמטת המוסיקה"},
            {"en": "Porat Uri", "he": "פורת אורי"},
            {"en": "Pines", "he": "פינס"},
            {"en": "Frug Shimon", "he": "פרוג שמעון"},
            {"en": "Frug", "he": "פרוג"},
            {"en": "Frishman David", "he": "פרישמן (דוד)"},
            {"en": "Frishman", "he": "פרישמן"},
            {"en": "Keren Hayesod", "he": "קרן היסוד"},
            {"en": "Keren Kayemet LeIsrael", "he": "קרן קיימת לישראל"},
            {"en": "Rutenberg Pinchas", "he": "רוטנברג (פנחס)"},
            {"en": "Rutenberg", "he": "רוטנברג"},
            {"en": "Sheinkin Menachem", "he": "שינקין (מנחם)"},
            {"en": "Sheinkin", "he": "שינקין"},
            {"en": "Shalit Sarah and Eliezer", "he": "שליט (שרה ואליעזר)"},
            {"en": "Shalit", "he": "שליט"},
            {"en": "Shemaryahu Levin", "he": "שמריהו לוין"},
            {"en": "Samson", "he": "שמשון"},
            {"en": "Spinoza Baruch", "he": "שפינוזה (ברוך)"},
            {"en": "Spinoza", "he": "שפינוזה"},
            {"en": "Shapira Zvi Herman", "he": "שפירא (צבי הרמן)"},
            {"en": "Shapira", "he": "שפירא"},
            {"en": "Tel Hai", "he": "תל חי"},
            {"en": "The Pines", "he": "האורנים"},
            {"en": "Herzl", "he": "הרצל"},
            {"en": "Jabotinsky", "he": "ז'בוטינסקי"},
            {"en": "The Gallows Martyrs", "he": "עולי הגרדום"},
            {"en": "Ein HaKoreh", "he": "עין הקורא"},
            {"en": "Rothschild", "he": "רוטשילד"},
            {"en": "Tarmav", "he": "תרמ\\"ב"},
            {"en": "Idelson Beba", "he": "אידלסון בבה"},
            {"en": "Begin Aliza", "he": "בגין עליזה"},
            {"en": "Gover Rivka", "he": "גובר רבקה"},
            {"en": "Grossman Chaika", "he": "גרוסמן חייקה"},
            {"en": "The First Kindergarten Teacher", "he": "הגננת הראשונה"},
            {"en": "Jabotinsky Yoana", "he": "ז'בוטינסקי יוענה"},
            {"en": "Memory of Sarah", "he": "זכרון שרה"},
            {"en": "Yanait Ben Zvi Rachel", "he": "ינאית בן צבי רחל"},
            {"en": "Kagan Rachel", "he": "כגן רחל"},
            {"en": "Kahansky Adina", "he": "כהנסקי עדינה"},
            {"en": "Levittov Zahara", "he": "לביטוב זהרה"},
            {"en": "Paula Ben Gurion", "he": "פולה בן גוריון"},
            {"en": "Frank Anne", "he": "פרנק אנה"},
            {"en": "Rabin Leah", "he": "רבין לאה"},
            {"en": "Rubina Chana", "he": "רובינא חנה"},
            {"en": "Reik Haviva", "he": "רייק חביבה"},
            {"en": "Shosheim Chana", "he": "שוסהיים חנה"},
            {"en": "Shlomo the Volunteer", "he": "שלמה המתנדב"},
            {"en": "Gevim", "he": "גבים"},
            {"en": "Yovelim", "he": "יובלים"},
            {"en": "Pathway Adva", "he": "משעול אדווה"},
            {"en": "Pathway Eshad", "he": "משעול אשד"},
            {"en": "Pathway Peleg", "he": "משעול פלג"},
            {"en": "Einot", "he": "עיינות"},
            {"en": "BILU", "he": "ביל\\"ו"},
            {"en": "Bethlehem", "he": "בית לחם"},
            {"en": "Belkind Shimshon", "he": "בלקינד שמשון"},
            {"en": "Bekerman Adam", "he": "בקרמן אדם"},
            {"en": "Gersberg Avraham", "he": "גרשברג אברהם"},
            {"en": "The Fathers", "he": "האבות"},
            {"en": "The ON", "he": "האו\\"ן"},
            {"en": "Rabbi Greenberg Baruch", "he": "הרב גרינברג ברוך"},
            {"en": "Rabbi Damari", "he": "הרב דמארי"},
            {"en": "Herbert Samuel", "he": "הרברט סמואל"},
            {"en": "HaShomer", "he": "השומר"},
            {"en": "Zelig Shimshon", "he": "זליג שמשון"},
            {"en": "Habakkuk", "he": "חבקוק"},
            {"en": "Hebron", "he": "חברון"},
            {"en": "Pioneers of Yesud HaMa'ala", "he": "חלוצי יסוד המעלה"},
            {"en": "Taviv", "he": "טביב"},
            {"en": "Toporovsky", "he": "טופורובסקי"},
            {"en": "Yudilovich", "he": "יודילוביץ'"},
            {"en": "Jerusalem", "he": "ירושלים"},
            {"en": "Levontin Zvi", "he": "לבונטין צבי"},
            {"en": "Lubman Habib Dov", "he": "לובמן חביב דב"},
            {"en": "Meirovitz", "he": "מאירוביץ"},
            {"en": "Maonot Bracha", "he": "מעונות ברכה"},
            {"en": "Alley of Benjamin", "he": "סמטת בנימין"},
            {"en": "Rokach", "he": "רוקח"},
            {"en": "Path of the Yemini Brothers", "he": "שביל האחים ימיני"},
            {"en": "Return to Zion", "he": "שיבת ציון"},
            {"en": "Segal Cohen Sarah", "he": "סגל כהן שרה"},
            {"en": "Ben Horin Doris", "he": "בן חורין דוריס"},
            {"en": "Marron Chana", "he": "מרון חנה"},
            {"en": "Cohen Geula", "he": "כהן גאולה"},
            {"en": "Goldschmidt Elisheva", "he": "גולדשמידט אלישבע"},
            {"en": "Alkabetz Ronit", "he": "אלקבץ רונית"},
            {"en": "The Hatzav", "he": "החצב"},
            {"en": "Even Shoshan", "he": "אבן שושן"},
            {"en": "Aharonovitz Yosef", "he": "אהרונוביץ' (יוסף)"},
            {"en": "Aharonovitz", "he": "אהרונוביץ'"},
            {"en": "Sister Sarah", "he": "אחות שרה"},
            {"en": "Achimeir Abba", "he": "אחימאיר אבא"},
            {"en": "Achimeir", "he": "אחימאיר"},
            {"en": "Imber Naftali Hertz", "he": "אימבר (נפתלי הרץ)"},
            {"en": "Imber", "he": "אימבר"},
            {"en": "Einstein Albert", "he": "אינשטיין (אלברט)"},
            {"en": "Einstein", "he": "אינשטיין"},
            {"en": "Argov Alexander Sasha", "he": "ארגוב אלכסנדר (סשה)"},
            {"en": "Argov", "he": "ארגוב"},
            {"en": "Arlozorov", "he": "ארלוזורוב"},
            {"en": "Borochov Dov Ber", "he": "בורוכוב (דב בר)"},
            {"en": "Borochov", "he": "בורוכוב"},
            {"en": "Bilinson Moshe", "he": "בילינסון (משה)"},
            {"en": "Bilinson", "he": "בילינסון"},
            {"en": "Ben Haim Paul", "he": "בן חיים פאול"},
            {"en": "Ben Haim", "he": "בן חיים"},
            {"en": "Baron Dvora", "he": "ברון דבורה"},
            {"en": "Brazilai Yehoshua", "he": "ברזילי (יהושע)"},
            {"en": "Brazilai", "he": "ברזילי"},
            {"en": "Brenner Yosef Chaim", "he": "ברנר (יוסף חיים)"},
            {"en": "Brenner", "he": "ברנר"},
            {"en": "Goldman Nachum", "he": "גולדמן נחום"},
            {"en": "Goldman", "he": "גולדמן"},
            {"en": "Golomb Eliyahu", "he": "גולומב (אליהו)"},
            {"en": "Golomb", "he": "גולומב"},
            {"en": "Gordon", "he": "גורדון"},
            {"en": "Gan Yavne", "he": "גן יבנה"},
            {"en": "Gretz Zvi", "he": "גרץ צבי"},
            {"en": "Gretz", "he": "גרץ"},
            {"en": "Dubnov Shimon", "he": "דובנוב (שמעון)"},
            {"en": "Dubnov", "he": "דובנוב"},
            {"en": "The Jacobi Brothers", "he": "האחים יעקובי"},
            {"en": "The Brigade", "he": "הבריגדה"},
            {"en": "The Hebrew Flag", "he": "הדגל העברי"},
            {"en": "The Histadrut", "he": "ההסתדרות"},
            {"en": "Hoz Dov", "he": "הוז דב"},
            {"en": "Hoz", "he": "הוז"},
            {"en": "The Fighters", "he": "הלוחמים"},
            {"en": "The Spring", "he": "המעיין"},
            {"en": "The Volunteers", "he": "המתנדבים"},
            {"en": "Hess Moshe", "he": "הס (משה)"},
            {"en": "Hess", "he": "הס"},
            {"en": "The Breakers", "he": "הפורצים"},
            {"en": "The First Orchard", "he": "הפרדס הראשון"},
            {"en": "The Dawn", "he": "השחר"},
            {"en": "The Hope", "he": "התקוה"},
            {"en": "Hatikva", "he": "התקווה"},
            {"en": "Vernik Israel", "he": "ורניק ישראל"},
            {"en": "Vernik", "he": "ורניק"},
            {"en": "Heletz", "he": "חלץ"},
            {"en": "Tabenkin Yitzhak", "he": "טבנקין יצחק"},
            {"en": "Tabenkin", "he": "טבנקין"},
            {"en": "Tchernichowsky Shaul", "he": "טשרניחובסקי (שאול)"},
            {"en": "Tchernichowsky", "he": "טשרניחובסקי"},
            {"en": "Yadin Yigal", "he": "ידין יגאל"},
            {"en": "Yadin", "he": "ידין"},
            {"en": "Katznelson Berl", "he": "כצנלסון (ברל)"},
            {"en": "Katznelson", "he": "כצנלסון"},
            {"en": "Lilienblum Moshe Leib", "he": "לילנבלום (משה לייב)"},
            {"en": "Lilienblum", "he": "לילנבלום"},
            {"en": "Laskov", "he": "לסקוב"},
            {"en": "Mapu Avraham", "he": "מאפו (אברהם)"},
            {"en": "Mapu", "he": "מאפו"},
            {"en": "Operation Kadesh", "he": "מבצע קדש"},
            {"en": "Micha Yosef Berdichevsky", "he": "מיכה יוסף (ברדיצ'בסקי)"},
            {"en": "Micha Yosef", "he": "מיכה יוסף"},
            {"en": "Mikhoels Shlomo", "he": "מיכואלס שלמה"},
            {"en": "Mikhoels", "he": "מיכואלס"},
            {"en": "Mendele Mocher Sforim", "he": "מנדלי (מוכר ספרים)"},
            {"en": "Mendele", "he": "מנדלי"},
            {"en": "Sirkin Nachman", "he": "סירקין נחמן"},
            {"en": "Sirkin", "he": "סירקין"},
            {"en": "Prof. Nachum Slouschz", "he": "פרופ' נחום (סלושץ)"},
            {"en": "Prof. Nachum", "he": "פרופ' נחום"},
            {"en": "Peri Yaakov", "he": "פרי יעקב"},
            {"en": "Peri", "he": "פרי"},
            {"en": "Peretz Y.L.", "he": "פרץ י' ל'"},
            {"en": "Peretz", "he": "פרץ"},
            {"en": "Tzemach", "he": "צמח"},
            {"en": "Kaplan Eliezer", "he": "קפלן (אליעזר)"},
            {"en": "Kaplan", "he": "קפלן"},
            {"en": "Kiryat Sefer", "he": "קריית ספר"},
            {"en": "Rubinstein Arthur", "he": "רובינשטיין ארתור"},
            {"en": "Rubinstein", "he": "רובינשטיין"},
            {"en": "Sh. Ben Zion", "he": "ש' בן ציון"},
            {"en": "Sderot Ben Gurion David", "he": "שד' בן גוריון (דוד)"},
            {"en": "Sderot Ben Gurion", "he": "שד' בן גוריון"},
            {"en": "Sderot Menachem Begin", "he": "שד' מנחם בגין"},
            {"en": "Shalom Aleichem", "he": "שלום עליכם"},
            {"en": "Shimoni David", "he": "שמעוני (דוד)"},
            {"en": "Shimoni", "he": "שמעוני"},
            {"en": "Eitan Eliyahu", "he": "איתן (אליהו)"},
            {"en": "Eitan", "he": "איתן"},
            {"en": "Elchanan Belkind", "he": "אלחנן (בולקינד)"},
            {"en": "Elchanan", "he": "אלחנן"},
            {"en": "Altalena", "he": "אלטלנה"},
            {"en": "Etzel", "he": "אצ\\"ל"},
            {"en": "Baskind Nadav", "he": "בסקינד נדב"},
            {"en": "Baskind", "he": "בסקינד"},
            {"en": "Bar Avraham", "he": "בר אברהם"},
            {"en": "Ginzburg", "he": "גינצבורג"},
            {"en": "Gluska Zecharia", "he": "גלוסקא (זכריה)"},
            {"en": "Gluska", "he": "גלוסקא"},
            {"en": "Gruniger Paul", "he": "גרוניגר פאול"},
            {"en": "Gruniger", "he": "גרוניגר"},
            {"en": "Derech Eden", "he": "דרך עדן"},
            {"en": "HaHagana", "he": "ההגנה"},
            {"en": "Hachsharat HaYishuv", "he": "הכשרת היישוב"},
            {"en": "HaAmit Yitzhak Mizrahi", "he": "העמית יצחק (מזרחי)"},
            {"en": "HaAmit Yitzhak", "he": "העמית יצחק"},
            {"en": "Rabbi Gerufi Shalom", "he": "הרב ג'רופי שלום"},
            {"en": "Rabbi Gerufi", "he": "הרב ג'רופי"},
            {"en": "HaSar Chaim Moshe Shapira", "he": "השר (חיים משה שפירא)"},
            {"en": "HaSar", "he": "השר"},
            {"en": "Children of Tehran", "he": "ילדי טהרן"},
            {"en": "Israeli Shimon", "he": "ישראלי שמעון"},
            {"en": "Israeli", "he": "ישראלי"},
            {"en": "Levi Moshe", "he": "לוי משה"},
            {"en": "Lazarov", "he": "לזרוב"},
            {"en": "Lehi", "he": "לח\\"י"},
            {"en": "Leibowitz Zvi", "he": "ליבוביץ' צבי"},
            {"en": "Leibowitz", "he": "ליבוביץ'"},
            {"en": "Moses Noah", "he": "מוזס נח"},
            {"en": "Moses", "he": "מוזס"},
            {"en": "Mazal Eliezer", "he": "מזל אליעזר"},
            {"en": "Mazal", "he": "מזל"},
            {"en": "Sachrov David", "he": "סחרוב (דוד)"},
            {"en": "Sachrov", "he": "סחרוב"},
            {"en": "Sapir Yosef", "he": "ספיר יוסף"},
            {"en": "Sapir", "he": "ספיר"},
            {"en": "Youth Aliyah", "he": "עליית הנוער"},
            {"en": "Platin Naftali", "he": "פלטין נפתלי"},
            {"en": "Platin", "he": "פלטין"},
            {"en": "Pinkas David", "he": "פנקס דוד"},
            {"en": "Pinkas", "he": "פנקס"},
            {"en": "Prof. Habot Biny", "he": "פרופ' חבוט בני"},
            {"en": "Prof. Habot", "he": "פרופ' חבוט"},
            {"en": "Frankel Pavel", "he": "פרנקל פאוול"},
            {"en": "Frankel", "he": "פרנקל"},
            {"en": "Kaner", "he": "קנר"},
            {"en": "Rozhansky Mordechai", "he": "רוז'נסקי מרדכי"},
            {"en": "Rozhansky", "he": "רוז'נסקי"},
            {"en": "Raziel David", "he": "רזיאל דוד"},
            {"en": "Raziel", "he": "רזיאל"},
            {"en": "Sderot Lishansky Yosef", "he": "שד' לישנסקי (יוסף)"},
            {"en": "Sderot Lishansky", "he": "שד' לישנסקי"},
            {"en": "Shayka Dan", "he": "שייקה דן"},
            {"en": "Shlang Ze'ev", "he": "שלנג זאב"},
            {"en": "Shlang", "he": "שלנג"},
            {"en": "Sharett Moshe", "he": "שרת משה"},
            {"en": "Sharett", "he": "שרת"},
            {"en": "Izakson Zvi", "he": "איזקסון (צבי)"},
            {"en": "Izakson", "he": "איזקסון"},
            {"en": "Anush", "he": "אנוש"},
            {"en": "Arbeli Almozlino", "he": "ארבלי אלמוזלינו"},
            {"en": "Ben Lulu Shimon Rabbi", "he": "בן לולו (שמעון, הרב)"},
            {"en": "Ben Lulu", "he": "בן לולו"},
            {"en": "Bakar Moshe", "he": "בקר משה"},
            {"en": "Bakar", "he": "בקר"},
            {"en": "Bershavsky", "he": "ברשבסקי"},
            {"en": "Gindi Menachem", "he": "גינדי מנחם"},
            {"en": "Gindi", "he": "גינדי"},
            {"en": "Dona Gracia", "he": "דונה גרציה"},
            {"en": "Dizengoff Meir", "he": "דיזינגוף מאיר"},
            {"en": "Dizengoff", "he": "דיזינגוף"},
            {"en": "Derech HaMaccabim", "he": "דרך המכבים"},
            {"en": "Derech Chaim Herzog", "he": "דרך חיים הרצוג"},
            {"en": "The Okashi Brothers", "he": "האחים עוקשי"},
            {"en": "Rabbi Rappaport", "he": "הרב רפפורט"},
            {"en": "The Industrialist", "he": "התעשיין"},
            {"en": "Windman Esther", "he": "וינדמן אסתר"},
            {"en": "Windman", "he": "וינדמן"},
            {"en": "Tulipman David", "he": "טוליפמן (דוד)"},
            {"en": "Tulipman", "he": "טוליפמן"},
            {"en": "Yakobi Yerah", "he": "יעקובי ירח"},
            {"en": "Yakobi", "he": "יעקובי"},
            {"en": "Cohen Menachem", "he": "כהן מנחם"},
            {"en": "Markowitz Avraham Aharon", "he": "מרקוביץ' (אברהם אהרון)"},
            {"en": "Markowitz", "he": "מרקוביץ'"},
            {"en": "Nesia", "he": "נסיה"},
            {"en": "PICA", "he": "פיק\\"א"},
            {"en": "Plotitzky Aryeh", "he": "פלוטיצקי (אריה)"},
            {"en": "Plotitzky", "he": "פלוטיצקי"},
            {"en": "Freiman Yaakov", "he": "פרימן יעקב"},
            {"en": "Freiman", "he": "פרימן"},
            {"en": "Prashkovsky", "he": "פרשקובסקי"},
            {"en": "Kazushner Avraham", "he": "קזושנר אברהם"},
            {"en": "Kazushner", "he": "קזושנר"},
            {"en": "Raoul Wallenberg", "he": "ראול ולנברג"},
            {"en": "Shlomo Ben David Pinchas", "he": "שלמה בן דוד פנחס"},
            {"en": "Shmutkin Binyamin", "he": "שמוטקין (בנימין)"},
            {"en": "Shmutkin", "he": "שמוטקין"},
            {"en": "Abba Eban", "he": "אבא אבן"},
            {"en": "Eban", "he": "אבן"},
            {"en": "Derech Munster", "he": "דרך מינסטר"},
            {"en": "Derech Meteorological Service", "he": "דרך השירות המטאורולוגי"},
            {"en": "Derech Zahavi Zvi and Tzipora", "he": "דרך זהבי (צבי וצפורה)"},
            {"en": "Derech Zahavi", "he": "דרך זהבי"},
            {"en": "Derech IDF", "he": "דרך צה\\"ל"},
            {"en": "Keter Aram Tzova", "he": "כתר ארם צובא"},
            {"en": "Nachmias Yaakov", "he": "נחמיאס יעקב"},
            {"en": "Nachmias", "he": "נחמיאס"},
            {"en": "Prof. Cameron Avraham", "he": "פרופ' קמרון (אברהם)"},
            {"en": "Prof. Cameron", "he": "פרופ' קמרון"},
            {"en": "Rabinowitz Shimshon", "he": "רבינוביץ שמשון"},
            {"en": "Rabinowitz", "he": "רבינוביץ"},
            {"en": "Sderot Motta Gur Mordechai", "he": "שד' מוטה (מרדכי) גור"},
            {"en": "Sderot Motta Gur", "he": "שד' מוטה גור"},
            {"en": "Sderot Moshe Dayan", "he": "שד' משה דיין"},
            {"en": "Ragforker Yosef Y.", "he": "ראג'פורקר יוסף י. (סופרלנד)"},
            {"en": "Ragforker", "he": "ראג'פורקר"},
            {"en": "Osovetsky Boris", "he": "אוסובצקי בוריס"},
            {"en": "Osovetsky", "he": "אוסובצקי"},
            {"en": "Alon Yigal", "he": "אלון יגאל"},
            {"en": "Alon", "he": "אלון"},
            {"en": "Beit Hillel", "he": "בית הלל"},
            {"en": "Beit Shammai", "he": "בית שמאי"},
            {"en": "Berger Aryeh", "he": "ברגר אריה"},
            {"en": "Berger", "he": "ברגר"},
            {"en": "Givshtein Yehoshua", "he": "גיבשטיין יהושע"},
            {"en": "Givshtein", "he": "גיבשטיין"},
            {"en": "The Sanhedrin", "he": "הסנהדרין"},
            {"en": "Rabbi Gutman Zvi", "he": "הרב גוטמן צבי"},
            {"en": "Rabbi Gutman", "he": "הרב גוטמן"},
            {"en": "Chazan Yaakov", "he": "חזן יעקב"},
            {"en": "Chazan", "he": "חזן"},
            {"en": "Chesed VeEmet", "he": "חסד ואמת (ע\\"ש ר' מ.מימון)"},
            {"en": "Yaari Meir", "he": "יערי מאיר"},
            {"en": "Yaari", "he": "יערי"},
            {"en": "Emmanuela Ben Yaakov", "he": "עמנואלה בן יעקב"},
            {"en": "Feinstein Yona Zvi", "he": "פיינשטיין יונה צבי"},
            {"en": "Feinstein", "he": "פיינשטיין"},
            {"en": "Kampinsky Genia and Dov", "he": "קמפינסקי (גניה ודב)"},
            {"en": "Kampinsky", "he": "קמפינסקי"},
            {"en": "Raam", "he": "ראם"},
            {"en": "Rabbi Yehuda HaNasi", "he": "רבי יהודה הנשיא"},
            {"en": "Rabbi Moshe Ben Nachman", "he": "רבי משה בן נחמן"},
            {"en": "Ramban", "he": "רמב\\"ן"},
            {"en": "Regev Mordechai", "he": "רגב מרדכי"},
            {"en": "Regev", "he": "רגב"},
            {"en": "Sderot Nimes", "he": "שד' נים"},
            {"en": "Burg Yosef", "he": "בורג יוסף"},
            {"en": "Burg", "he": "בורג"},
            {"en": "HaHityashvut", "he": "ההתישבות"},
            {"en": "Keteriel", "he": "כתריאל"},
            {"en": "The Initiative", "he": "היוזמה"},
            {"en": "The Creation", "he": "היצירה"},
            {"en": "The Science", "he": "המדע"},
            {"en": "The Progress", "he": "הקידמה"},
            {"en": "The Prosperity", "he": "השגשוג"},
            {"en": "The Discovery", "he": "התגלית"},
            {"en": "Mushovitz Mark Mara", "he": "מושוביץ מרק (מרה)"},
            {"en": "Mushovitz", "he": "מושוביץ"},
            {"en": "Shavit Avraham Buma", "he": "שביט אברהם (בומה)"},
            {"en": "Shavit", "he": "שביט"},
            {"en": "Shenkar Aryeh", "he": "שנקר אריה"},
            {"en": "Shenkar", "he": "שנקר"},
            {"en": "Choma U'Migdal", "he": "חומה ומגדל"},
            {"en": "The Organ", "he": "האורגן"},
            {"en": "The Gittit", "he": "הגיתית"},
            {"en": "The Flute", "he": "החליל"},
            {"en": "The Trumpet", "he": "החצוצרה"},
            {"en": "The Violin", "he": "הכינור"},
            {"en": "The Harmonica", "he": "המפוחית"},
            {"en": "The Cymbals", "he": "המצילתיים"},
            {"en": "The Organ", "he": "העוגב"},
            {"en": "The Piano", "he": "הפסנתר"},
            {"en": "The Clarinet", "he": "הקלרנית"},
            {"en": "The Drum", "he": "התוף"},
            {"en": "The Orchestra", "he": "התזמורת"},
            {"en": "Sderot Yitzhak Rabin", "he": "שד יצחק רבין"},
            {"en": "Ibn Gabirol", "he": "אבן גבירול"},
            {"en": "Ofir Shayka", "he": "אופיר שייקה"},
            {"en": "Or HaChaim", "he": "אור החיים"},
            {"en": "Uri-Zvi Greenberg", "he": "אורי-צבי גרינברג"},
            {"en": "Alharizi", "he": "אלחריזי"},
            {"en": "Alkabetz", "he": "אלקבץ"},
            {"en": "Alterman", "he": "אלתרמן"},
            {"en": "Burla", "he": "בורלא"},
            {"en": "Beit HaLevi", "he": "בית הלוי"},
            {"en": "Ben Ish Chai", "he": "בן איש חי"},
            {"en": "Ben Seruk", "he": "בן סרוק"},
            {"en": "Benvenisti", "he": "בנבנישתי"},
            {"en": "Baal HaTurim", "he": "בעל הטורים"},
            {"en": "Bar-Lev Chaim", "he": "בר-לב חיים"},
            {"en": "Bergman", "he": "ברגמן"},
            {"en": "Gedolei Yisrael", "he": "גדולי ישראל"},
            {"en": "Damari Shoshana", "he": "דמארי שושנה"},
            {"en": "Hazaz", "he": "הזז"},
            {"en": "The Poet Rachel", "he": "המשוררת רחל"},
            {"en": "HaNagid", "he": "הנגיד"},
            {"en": "Rabbi Unterman", "he": "הרב אונטרמן"},
            {"en": "Rabbi Goren", "he": "הרב גורן"},
            {"en": "Rabbi Neria", "he": "הרב נריה"},
            {"en": "Rabbi Kafach", "he": "הרב קאפח"},
            {"en": "The Rebbe of Lubavitch", "he": "הרבי מלובביץ'"},
            {"en": "Rashba", "he": "הרשב\\"א"},
            {"en": "Hebrew Poetry", "he": "השירה העברית"},
            {"en": "Zamenhof", "he": "זמנהוף"},
            {"en": "Choma", "he": "חומה"},
            {"en": "Hasdai", "he": "חסדאי"},
            {"en": "Levi Eshkol", "he": "לוי אשכול"},
            {"en": "Lamdan", "he": "למדן"},
            {"en": "Mosinson Yigal", "he": "מוסינזון יגאל"},
            {"en": "Mosinson", "he": "מוסינזון"},
            {"en": "Morashet Yisrael", "he": "מורשת ישראל"},
            {"en": "Manor Ehud", "he": "מנור אהוד"},
            {"en": "Manor", "he": "מנור"},
            {"en": "Martin Buber", "he": "מרטין בובר"},
            {"en": "Miriam", "he": "מרים"},
            {"en": "Kovner Abba", "he": "קובנר אבא"},
            {"en": "Kovner", "he": "קובנר"},
            {"en": "Kipnis", "he": "קיפניס"},
            {"en": "Kalischer", "he": "קלישר"},
            {"en": "RIVL", "he": "ריב\\"ל"},
            {"en": "Ramchal", "he": "רמח\\"ל"},
            {"en": "Shlonsky", "he": "שלונסקי"},
            {"en": "Shmer Naomi", "he": "שמר נעמי"},
            {"en": "Shmer", "he": "שמר"},
            {"en": "Golden Age", "he": "תור הזהב"},
            {"en": "Avnei Eitan", "he": "אבני איתן"},
            {"en": "Ugda", "he": "אוגדה"},
            {"en": "Odem", "he": "אודם"},
            {"en": "Ofira", "he": "אופירה"},
            {"en": "Ortal", "he": "אורטל"},
            {"en": "Eitam", "he": "איתם"},
            {"en": "El-Rom", "he": "אל-רום"},
            {"en": "Alonei HaBashan", "he": "אלוני הבשן"},
            {"en": "Eli Al", "he": "אלי על"},
            {"en": "Aniam", "he": "אניעם"},
            {"en": "Afik", "he": "אפיק"},
            {"en": "Bnei Chayil", "he": "בני חייל"},
            {"en": "Bnei Yehuda", "he": "בני יהודה"},
            {"en": "Givat Yoav", "he": "גבעת יואב"},
            {"en": "Geshur", "he": "גשור"},
            {"en": "Di-Zahav", "he": "די-זהב"},
            {"en": "Dekela", "he": "דקלה"},
            {"en": "The Pioneers", "he": "החלוצים"},
            {"en": "Had-Nes", "he": "חד-נס"},
            {"en": "Chativa Sheva", "he": "חטיבה שבע"},
            {"en": "Haspin", "he": "חספין"},
            {"en": "Chatzer Adar", "he": "חצר אדר"},
            {"en": "Yonatan", "he": "יונתן"},
            {"en": "Yamit", "he": "ימית"},
            {"en": "Kanaf", "he": "כנף"},
            {"en": "Kfar Darom", "he": "כפר דרום"},
            {"en": "Kfar Charuv", "he": "כפר חרוב"},
            {"en": "Mevo Chama", "he": "מבוא חמה"},
            {"en": "Mevo'ot Hermon", "he": "מבואות חרמון"},
            {"en": "Metzar", "he": "מיצר"},
            {"en": "Ma'ale Gamla", "he": "מעלה גמלא"},
            {"en": "Marom Golan", "he": "מרום גולן"},
            {"en": "Pathway Breichat Ram", "he": "משעול בריכת רם"},
            {"en": "Pathway Zavitan", "he": "משעול זוויתן"},
            {"en": "Pathway Meshushim", "he": "משעול משושים"},
            {"en": "Neot Golan", "he": "נאות גולן"},
            {"en": "Neot Sinai", "he": "נאות סיני"},
            {"en": "Neviot", "he": "נביעות"},
            {"en": "Nov", "he": "נוב"},
            {"en": "Neve ATIV", "he": "נווה אטי\\"ב"},
            {"en": "Neve Dekalim", "he": "נווה דקלים"},
            {"en": "Nachal Yam", "he": "נח\\"ל-ים"},
            {"en": "Nachal Nimrod", "he": "נח\\"ל נמרוד"},
            {"en": "Netur", "he": "נטור"},
            {"en": "Nir Avraham", "he": "ניר אברהם"},
            {"en": "Na'ama", "he": "נעמה"},
            {"en": "Netiv HaAsara", "he": "נתיב העשרה"},
            {"en": "Ein Zivan", "he": "עין זיוון"},
            {"en": "Atzmona", "he": "עצמונה"},
            {"en": "Peri-Gan", "he": "פרי-גן"},
            {"en": "Kadmat Sinai", "he": "קדמת סיני"},
            {"en": "Kadmat Zvi", "he": "קדמת צבי"},
            {"en": "Kela", "he": "קלע"},
            {"en": "Katzrin", "he": "קצרין"},
            {"en": "Keshet", "he": "קשת"},
            {"en": "Ramot", "he": "רמות"},
            {"en": "Ramat Magshimim", "he": "רמת מגשימים"},
            {"en": "Refidim", "he": "רפידים"},
            {"en": "Sdot", "he": "שדות"},
            {"en": "Sion", "he": "שיאון"},
            {"en": "Sha'al", "he": "שעל"},
            {"en": "Bernstein Eliezer", "he": "ברנשטיין (אליעזר)"},
            {"en": "Bernstein", "he": "ברנשטיין"},
            {"en": "Grynszpan Herschel", "he": "גרינשפן הרשל"},
            {"en": "Grynszpan", "he": "גרינשפן"},
            {"en": "The Hoopoe", "he": "הדוכיפת"},
            {"en": "The Starling", "he": "הזרזיר"},
            {"en": "The Quail", "he": "החגלה"},
            {"en": "The Goldfinch", "he": "החוחית"},
            {"en": "The Wagtail", "he": "הנחליאלי"},
            {"en": "The Raven", "he": "העורב"},
            {"en": "The Lark", "he": "העפרוני"},
            {"en": "The Cuckoo", "he": "הקוקיה"},
            {"en": "The Dove", "he": "התור"},
            {"en": "Tibowitz Yehuda Rabbi", "he": "טיבוביץ' (יהודה, הרב)"},
            {"en": "Tibowitz", "he": "טיבוביץ'"},
            {"en": "Katzler Feivush", "he": "כצלר פייבוש"},
            {"en": "Katzler", "he": "כצלר"},
            {"en": "Mazia", "he": "מזי\\"א"},
            {"en": "Arbel", "he": "ארבל"},
            {"en": "The Gilboa", "he": "הגלבוע"},
            {"en": "Mount Zion", "he": "הר ציון"},
            {"en": "The Samaria", "he": "השומרון"},
            {"en": "The Tabor", "he": "התבור"},
            {"en": "Meron", "he": "מירון"},
            {"en": "Ravitz Yosef", "he": "רויז יוסף"},
            {"en": "Ravitz", "he": "רויז"},
            {"en": "Remez", "he": "רמז"},
            {"en": "Avichail", "he": "אביחיל"},
            {"en": "Adar", "he": "אדר"},
            {"en": "Queen Esther", "he": "אסתר המלכה"},
            {"en": "Argaman", "he": "ארגמן"},
            {"en": "Bahat", "he": "בהט"},
            {"en": "The Letter", "he": "האגרת"},
            {"en": "Hadassah", "he": "הדסה"},
            {"en": "The Crown", "he": "הכתר"},
            {"en": "The Frankincense", "he": "הלבונה"},
            {"en": "The Scroll", "he": "המגילה"},
            {"en": "The King", "he": "המלך"},
            {"en": "The Pur", "he": "הפור"},
            {"en": "The Scepter", "he": "השרביט"},
            {"en": "The Tekhelet", "he": "התכלת"},
            {"en": "CHEN", "he": "ח\\"ן"},
            {"en": "Air Force", "he": "חיל האויר"},
            {"en": "Engineering Corps", "he": "חיל ההנדסה"},
            {"en": "Ordnance Corps", "he": "חיל החימוש"},
            {"en": "Navy", "he": "חיל הים"},
            {"en": "Intelligence Corps", "he": "חיל המודיעין"},
            {"en": "Paratroopers", "he": "חיל הצנחנים"},
            {"en": "Signal Corps", "he": "חיל הקשר"},
            {"en": "Infantry", "he": "חיל הרגלים"},
            {"en": "Medical Corps", "he": "חיל הרפואה"},
            {"en": "Adjutant Corps", "he": "חיל השלישות"},
            {"en": "Armored Corps", "he": "חיל השריון"},
            {"en": "Artillery Corps", "he": "חיל התותחנים"},
            {"en": "CHAMAD", "he": "חמ\\"ד"},
            {"en": "Yom Tov Reuven", "he": "יום-טוב ראובן"},
            {"en": "Yom Tov", "he": "יום-טוב"},
            {"en": "Cyrus", "he": "כורש"},
            {"en": "Landau Chaim", "he": "לנדאו (חיים)"},
            {"en": "Landau", "he": "לנדאו"},
            {"en": "Myrrh", "he": "מור"},
            {"en": "Mordechai the Jew", "he": "מרדכי היהודי"},
            {"en": "Golden Crown", "he": "עטרת זהב"},
            {"en": "Sderot Rehavam Ze'evi", "he": "שד' רחבעם (זאבי)"},
            {"en": "Sderot Rehavam", "he": "שד' רחבעם"},
            {"en": "Shushan the Capital", "he": "שושן הבירה"},
            {"en": "Shoshanat Yaakov", "he": "שושנת יעקב"},
            {"en": "Shazar Zalman", "he": "שז\\"ר זלמן"},
            {"en": "Shazar", "he": "שז\\"ר"},
            {"en": "The King's Gate", "he": "שער המלך"},
            {"en": "Even Chen", "he": "אבן חן"},
            {"en": "Stones of the Breastplate", "he": "אבני החושן"},
            {"en": "Crystal", "he": "בדולח"},
            {"en": "Emerald", "he": "ברקת"},
            {"en": "Granite", "he": "גרניט"},
            {"en": "Goldfish", "he": "דג הזהב"},
            {"en": "5th of Iyar", "he": "ה' באייר"},
            {"en": "The Salmon", "he": "האילתית"},
            {"en": "The Corals", "he": "האלמוגים"},
            {"en": "The Ship", "he": "האניה"},
            {"en": "The Barracuda", "he": "הברקן"},
            {"en": "The Waves", "he": "הגלים"},
            {"en": "The Dinghy", "he": "הדוגית"},
            {"en": "The Dolphin", "he": "הדולפין"},
            {"en": "The Squid", "he": "הדיונון"},
            {"en": "The Fishermen", "he": "הדייגים"},
            {"en": "The Parrotfish", "he": "הזהרון"},
            {"en": "The Silverfish", "he": "הכסיף"},
            {"en": "The Whale", "he": "הלווייתן"},
            {"en": "The Sailors", "he": "המלחים"},
            {"en": "The Sail", "he": "המפרש"},
            {"en": "The Oar", "he": "המשוט"},
            {"en": "The Surge", "he": "הנחשול"},
            {"en": "The Port", "he": "הנמל"},
            {"en": "The Deck", "he": "הסיפון"},
            {"en": "The Boat", "he": "הסירה"},
            {"en": "The Fin", "he": "הסנפיר"},
            {"en": "The Anchor", "he": "העוגן"},
            {"en": "The Snapper", "he": "הפזית"},
            {"en": "The Shell", "he": "הצדף"},
            {"en": "The Captain", "he": "הקברניט"},
            {"en": "The Conch", "he": "הקונכיה"},
            {"en": "Rabbi Yosef Ezran", "he": "הרב יוסף עזרן"},
            {"en": "The Raft", "he": "הרפסודה"},
            {"en": "The Net", "he": "הרשת"},
            {"en": "The Reef", "he": "השונית"},
            {"en": "The Sailors", "he": "השייטים"},
            {"en": "The Mast", "he": "התורן"},
            {"en": "Topaz", "he": "טופז"},
            {"en": "Diamond", "he": "יהלום"},
            {"en": "Leshem", "he": "לשם"},
            {"en": "Operation Spring of Youth", "he": "מבצע אביב נעורים"},
            {"en": "Operation Cypress", "he": "מבצע ברוש"},
            {"en": "Operation Lightning", "he": "מבצע ברק"},
            {"en": "Operation Accountability", "he": "מבצע דין וחשבון"},
            {"en": "Operation Danny", "he": "מבצע דני"},
            {"en": "Operation Harel", "he": "מבצע הראל"},
            {"en": "Operation Defensive Shield", "he": "מבצע חומת מגן"},
            {"en": "Operation Horev", "he": "מבצע חורב"},
            {"en": "Operation Hiram", "he": "מבצע חירם"},
            {"en": "Operation Yoav", "he": "מבצע יואב"},
            {"en": "Operation Yonatan", "he": "מבצע יונתן"},
            {"en": "Operation Litani", "he": "מבצע ליטאני"},
            {"en": "Operation Moses", "he": "מבצע משה"},
            {"en": "Operation Nachshon", "he": "מבצע נחשון"},
            {"en": "Operation Uvda", "he": "מבצע עובדה"},
            {"en": "Operation Grapes of Wrath", "he": "מבצע ענבי זעם"},
            {"en": "Operation Solomon", "he": "מבצע שלמה"},
            {"en": "Operation Tammuz", "he": "מבצע תמוז"},
            {"en": "Lighthouse", "he": "מגדלור"},
            {"en": "Amber", "he": "ענבר"},
            {"en": "Coral", "he": "קורל"},
            {"en": "Crystal", "he": "קריסטל"},
            {"en": "Necklace", "he": "רביד"},
            {"en": "Shoham", "he": "שוהם"},
            {"en": "Ivory", "he": "שנהב"},
            {"en": "Six Day War", "he": "ששת הימים"},
            {"en": "Tarshish", "he": "תרשיש"},
            {"en": "Eliezer Eli Yablon", "he": "אליעזר (אלי) יבלון"},
            {"en": "Eliezer Yablon", "he": "אליעזר יבלון"},
            {"en": "Esther Arditi", "he": "אסתר ארדיטי"},
            {"en": "The Chiefs of Staff", "he": "הרמטכ\\"לים"},
            {"en": "Yael Rom", "he": "יעל רום"},
            {"en": "Sderot HaHarchava", "he": "שדרות ההדרכה"},
            {"en": "Sderot Tzrifin", "he": "שדרות צריפין"},
            {"en": "Shlomo Levi", "he": "שלמה לוי"},
            {"en": "Sha'ar Yafo", "he": "שער יפו"},
            {"en": "Tzabari Rachel", "he": "צברי רחל"},
            {"en": "Rosenthal-Habilyo Chaya", "he": "רוזנטל- חביליו חיה"},
            {"en": "Ozen Aharon", "he": "אוזן אהרון"},
            {"en": "Ozen", "he": "אוזן"},
            {"en": "Ofek Rehavia", "he": "אופק רחביה"},
            {"en": "Ofek", "he": "אופק"},
            {"en": "Eil Molik Shmuel", "he": "איל מוליק (שמואל)"},
            {"en": "Eil Molik", "he": "איל מוליק"},
            {"en": "Aloni Shulamit", "he": "אלוני שולמית"},
            {"en": "Aloni", "he": "אלוני"},
            {"en": "Elisha Cohen", "he": "אלישע (כהן)"},
            {"en": "Elisha", "he": "אלישע"},
            {"en": "Alter David HaCohen Kurzman", "he": "אלתר דוד הכהן (קורצמן)"},
            {"en": "Alter David HaCohen", "he": "אלתר דוד הכהן"},
            {"en": "Asher Orenbach", "he": "אשר אורנבך"},
            {"en": "Asher", "he": "אשר"},
            {"en": "Bari", "he": "בארי"},
            {"en": "Ben Porat Miriam", "he": "בן פורת מרים"},
            {"en": "Ben Porat", "he": "בן פורת"},
            {"en": "Bashari Saadia and Yosef", "he": "בשארי סעדיה ויוסף"},
            {"en": "Bashari", "he": "בשארי"},
            {"en": "Joe Amar", "he": "ג'ו עמר"},
            {"en": "Heroes of Israel", "he": "גבורי ישראל"},
            {"en": "Gevin Moshe", "he": "גבין משה"},
            {"en": "Gevin", "he": "גבין"},
            {"en": "Gura Shoshana and Moshe", "he": "גורה שושנה ומשה"},
            {"en": "Gura", "he": "גורה"},
            {"en": "Gal Mira", "he": "גל מירה"},
            {"en": "Gal", "he": "גל"},
            {"en": "Ganot Zvi", "he": "גנות צבי"},
            {"en": "Ganot", "he": "גנות"},
            {"en": "Gratzberg Shika", "he": "גרצברג שיקא"},
            {"en": "Gratzberg", "he": "גרצברג"},
            {"en": "Dalia Peri", "he": "דליה פרי"},
            {"en": "Dalia", "he": "דליה"},
            {"en": "Dashavsky Israel", "he": "דשבסקי ישראל"},
            {"en": "Dashavsky", "he": "דשבסקי"},
            {"en": "The Pear", "he": "האגס"},
            {"en": "The Glazer Brothers", "he": "האחים גלזר"},
            {"en": "The Tree", "he": "האילן"},
            {"en": "The Persimmon", "he": "פרסמון"},
            {"en": "The Grapefruit", "he": "האשכולית"},
            {"en": "The Sons", "he": "הבנים"},
            {"en": "The Cypresses", "he": "הברושים"},
            {"en": "The Citrus", "he": "ההדר"},
            {"en": "The Forest", "he": "היער"},
            {"en": "The Lemon", "he": "הלימון"},
            {"en": "The Mukhtar", "he": "המוכתר"},
            {"en": "The Teacher Avraham", "he": "המורה אברהם"},
            {"en": "The Colony", "he": "המושבה"},
            {"en": "The Founders", "he": "המייסדים"},
            {"en": "The Nachala", "he": "הנחלה"},
            {"en": "The Grape", "he": "העינב"},
            {"en": "Independence", "he": "העצמאות"},
            {"en": "The Ficus", "he": "הפיקוסים"},
            {"en": "Rabbi Avraham Meir Yakobovitz", "he": "הרב (אברהם מאיר) יעקובוביץ'"},
            {"en": "Rabbi Yakobovitz", "he": "הרב יעקובוביץ'"},
            {"en": "Rabbi Tzalach Moshe", "he": "הרב צאלח (משה)"},
            {"en": "Rabbi Tzalach", "he": "הרב צאלח"},
            {"en": "Rabbi Shlinka Yitzhak", "he": "הרב שלינקה יצחק"},
            {"en": "Rabbi Shlinka", "he": "הרב שלינקה"},
            {"en": "Hershkovitz", "he": "הרשקוביץ"},
            {"en": "The Reserve", "he": "השמורה"},
            {"en": "The Two", "he": "השניים"},
            {"en": "The Date Palm", "he": "התמר"},
            {"en": "The Orange", "he": "התפוז"},
            {"en": "Weinberg Avraham", "he": "וינברג אברהם"},
            {"en": "Weinberg", "he": "וינברג"},
            {"en": "Veld Yitzhak Igo", "he": "ולד יצחק (איגו)"},
            {"en": "Veld", "he": "ולד"},
            {"en": "Zusman", "he": "זוסמן"},
            {"en": "Zeitzer Chava and Binyamin", "he": "זיצר חוה ובינימין"},
            {"en": "Zeitzer", "he": "זיצר"},
            {"en": "Zaltzman Aharon and Menachem", "he": "זלצמן אהרון ומנחם"},
            {"en": "Zaltzman", "he": "זלצמן"},
            {"en": "Zemer Chana", "he": "זמר חנה"},
            {"en": "Zemer", "he": "זמר"},
            {"en": "Chovev Meir and Zvi", "he": "חובב מאיר וצבי"},
            {"en": "Chovev", "he": "חובב"},
            {"en": "Chacham Ezra Cohen", "he": "חכם עזרא כהן"},
            {"en": "Yair Doron", "he": "יאיר דורון"},
            {"en": "Yosef Ben Ovadia", "he": "יוסף בן עובדיה"},
            {"en": "Yakobi Shaul", "he": "יעקובי שאול"},
            {"en": "Yitzhak Ben David", "he": "יצחק בן דוד"},
            {"en": "Yarkoni Yaffa", "he": "ירקוני יפה"},
            {"en": "Yarkoni", "he": "ירקוני"},
            {"en": "Cohen Eli", "he": "כהן אלי"},
            {"en": "Independence Square", "he": "כיכר העצמאות"},
            {"en": "29th of November Square", "he": "כיכר כ\\"ט בנובמבר"},
            {"en": "Alliance Israelite Universelle", "he": "כל ישראל חברים (כי\\"ח -אליאנס)"},
            {"en": "Luz", "he": "לוז"},
            {"en": "Levin Yosef and Risa", "he": "ליבין יוסף וריסיה"},
            {"en": "Levin", "he": "ליבין"},
            {"en": "Lifshitz Shlomo Leib", "he": "ליפשיץ שלמה לייב"},
            {"en": "Lifshitz", "he": "ליפשיץ"},
            {"en": "Mager Yehuda and Aviva", "he": "מגר יהודה ואביבה"},
            {"en": "Mager", "he": "מגר"},
            {"en": "Midan Amiram", "he": "מידן עמירם"},
            {"en": "Midan", "he": "מידן"},
            {"en": "Miller Zvi", "he": "מילר צבי"},
            {"en": "Miller", "he": "מילר"},
            {"en": "Malal Nissim", "he": "מלל נסים"},
            {"en": "Malal", "he": "מלל"},
            {"en": "Exodus Immigrants", "he": "מעפילי אקסודוס"},
            {"en": "Pathway Moshe and Binyamin", "he": "משעול משה ובנימין"},
            {"en": "Nachmoni Yehudit and Elikom", "he": "נחמוני יהודית ואליקום"},
            {"en": "Nachmoni", "he": "נחמוני"},
            {"en": "Naam Leonar", "he": "נעם לאונר"},
            {"en": "Naam", "he": "נעם"},
            {"en": "Siterman Michael", "he": "סיטרמן (מיכאל)"},
            {"en": "Siterman", "he": "סיטרמן"},
            {"en": "Solomon", "he": "סלומון"},
            {"en": "Sanhedrai Goldreich Tova", "he": "סנהדראי גולדרייך טובה"},
            {"en": "Sanhedrai", "he": "סנהדראי"},
            {"en": "Ada", "he": "עדה"},
            {"en": "Omer Dvora", "he": "עומר דבורה"},
            {"en": "Omer", "he": "עומר"},
            {"en": "Emmanuel Ringelblum", "he": "עמנואל (רינגלבלום)"},
            {"en": "Emmanuel", "he": "עמנואל"},
            {"en": "Ofra Haza", "he": "עפרה חזה"},
            {"en": "Fleischer Chaya", "he": "פליישר חיה"},
            {"en": "Fleischer", "he": "פליישר"},
            {"en": "Tzmir Elimelech", "he": "צמיר אלימלך"},
            {"en": "Tzmir", "he": "צמיר"},
            {"en": "Kibbutz Galuyot", "he": "קיבוץ גלויות"},
            {"en": "Karai Felicia Dr.", "he": "קראי פליציה, ד\\"ר"},
            {"en": "Karai", "he": "קראי"},
            {"en": "Rabbi Yosef Buchritz", "he": "רבי יוסף בוכריץ"},
            {"en": "Rabbi Moshe Kalphon HaCohen", "he": "רבי משה כלפון הכהן"},
            {"en": "Reingold Chana", "he": "ריינגולד חנה"},
            {"en": "Reingold", "he": "ריינגולד"},
            {"en": "Shabazi Shalom", "he": "שבזי שלום"},
            {"en": "Shabazi", "he": "שבזי"},
            {"en": "Sderot HaYovel", "he": "שד' היובל"},
            {"en": "Sderot HaTzionut", "he": "שד' הציונות"},
            {"en": "Shamir Yitzhak", "he": "שמיר יצחק"},
            {"en": "Shamir", "he": "שמיר"},
            {"en": "Altman Sydney", "he": "אלטמן סידני"},
            {"en": "Altman", "he": "אלטמן"},
            {"en": "Arrow Kenneth Joseph", "he": "ארו קנט' ג'וזף"},
            {"en": "Arrow", "he": "ארו"},
            {"en": "Bohr Niels", "he": "בוהר נילס"},
            {"en": "Bohr", "he": "בוהר"},
            {"en": "Baltimore David", "he": "בולטימור דוד"},
            {"en": "Baltimore", "he": "בולטימור"},
            {"en": "Bellow Saul", "he": "בלו סול"},
            {"en": "Bellow", "he": "בלו"},
            {"en": "Benacerraf Baruch", "he": "בנאסרף ברוך"},
            {"en": "Benacerraf", "he": "בנאסרף"},
            {"en": "Berg Paul", "he": "ברג פול"},
            {"en": "Berg", "he": "ברג"},
            {"en": "Bergson Henri", "he": "ברגסון הנרי"},
            {"en": "Bergson", "he": "ברגסון"},
            {"en": "Brodsky Joseph", "he": "ברודסקי יוסף"},
            {"en": "Brodsky", "he": "ברודסקי"},
            {"en": "Bashevis-Singer Isaac", "he": "בשביס-זינגר יצחק"},
            {"en": "Bashevis-Singer", "he": "בשביס-זינגר"},
            {"en": "Jacob Francois", "he": "ג'קוב פרנסואה"},
            {"en": "Jacob", "he": "ג'קוב"},
            {"en": "Gary Becker", "he": "גארי בקר"},
            {"en": "Gordimer Nadine", "he": "גורדימר נאדין"},
            {"en": "Gordimer", "he": "גורדימר"},
            {"en": "Gell-Mann Murray", "he": "גל-מן מוריי"},
            {"en": "Gell-Mann", "he": "גל-מן"},
            {"en": "Glaser Donald", "he": "גלזר דונלד"},
            {"en": "Glaser", "he": "גלזר"},
            {"en": "Glashow Sheldon", "he": "גלשאו שלדון"},
            {"en": "Glashow", "he": "גלשאו"},
            {"en": "Dr. Zhivago", "he": "ד\\"ר ז'יוואגו"},
            {"en": "de Hevesy George", "he": "דה-הבשי ג'ורג'"},
            {"en": "de Hevesy", "he": "דה-הבשי"},
            {"en": "The University", "he": "האוניברסיטה"},
            {"en": "Hoffman Roald", "he": "הופמן רואלד"},
            {"en": "Hoffman", "he": "הופמן"},
            {"en": "Heyse Paul", "he": "הייז פול"},
            {"en": "Heyse", "he": "הייז"},
            {"en": "The Magician of Lublin", "he": "הקוסם מלובלין"},
            {"en": "Harry Markowitz", "he": "הרי (מרקוביץ')"},
            {"en": "Hertz Gustav", "he": "הרץ גוסטב"},
            {"en": "Hertz", "he": "הרץ"},
            {"en": "Hershko Avraham", "he": "הרשקו אברהם"},
            {"en": "Hershko", "he": "הרשקו"},
            {"en": "Wiesel Elie", "he": "ויזל אלי"},
            {"en": "Wiesel", "he": "ויזל"},
            {"en": "Warburg Otto", "he": "ורבורג אוטו"},
            {"en": "Warburg", "he": "ורבורג"},
            {"en": "Varmus Harold", "he": "ורמוס הרולד"},
            {"en": "Varmus", "he": "ורמוס"},
            {"en": "Sachs Nelly", "he": "זקס נלי"},
            {"en": "Sachs", "he": "זקס"},
            {"en": "Ticho Anna", "he": "טיכו אנה"},
            {"en": "Ticho", "he": "טיכו"},
            {"en": "Yalow Rosalyn", "he": "יאלו רוזלין"},
            {"en": "Yalow", "he": "יאלו"},
            {"en": "Katz Sir Bernard", "he": "כ\\"ץ סר ברנרד"},
            {"en": "Katz", "he": "כ\\"ץ"},
            {"en": "Levi-Montalcini Rita", "he": "לוי מונטלצ'יני ריטה"},
            {"en": "Levi-Montalcini", "he": "לוי מונטלצ'יני"},
            {"en": "Luria Salvador", "he": "לוריא סלבדור"},
            {"en": "Luria", "he": "לוריא"},
            {"en": "Landau Lev Davidovich", "he": "לנדאו לב דוידוביץ"},
            {"en": "Modigliani Franco", "he": "מודליאני פרנקו"},
            {"en": "Modigliani", "he": "מודליאני"},
            {"en": "The Rain King", "he": "מלך הגשם"},
            {"en": "Circle of Peace", "he": "מעגל השלום"},
            {"en": "Auto-da-Fe", "he": "משחק העיניים"},
            {"en": "Pathway of Chemistry", "he": "משעול הכימייה"},
            {"en": "Pathway of Economics", "he": "משעול הכלכלה"},
            {"en": "Pathway of Literature", "he": "משעול הספרות"},
            {"en": "Pathway of Physics", "he": "משעול הפיסיקה"},
            {"en": "Pathway of Medicine", "he": "משעול הרפואה"},
            {"en": "Nathans Daniel", "he": "נתנס דניאל"},
            {"en": "Nathans", "he": "נתנס"},
            {"en": "Solow Robert", "he": "סולו רוברט"},
            {"en": "Solow", "he": "סולו"},
            {"en": "Simon Herbert", "he": "סימון הרברט"},
            {"en": "Simon", "he": "סימון"},
            {"en": "Tales of the Hasidim", "he": "סיפורי אגדות"},
            {"en": "Samuelson Paul", "he": "סמואלסון פול"},
            {"en": "Samuelson", "he": "סמואלסון"},
            {"en": "Fogel Robert", "he": "פוגל רוברט"},
            {"en": "Fogel", "he": "פוגל"},
            {"en": "Feynman Richard", "he": "פיינמן ריצ'ארד"},
            {"en": "Feynman", "he": "פיינמן"},
            {"en": "Fischer Edmond", "he": "פישר אדמונד"},
            {"en": "Fischer", "he": "פישר"},
            {"en": "Penzias Arno", "he": "פנזיאס ארנו"},
            {"en": "Penzias", "he": "פנזיאס"},
            {"en": "Pasternak Boris", "he": "פסטרנק בוריס"},
            {"en": "Pasternak", "he": "פסטרנק"},
            {"en": "Friedman Milton", "he": "פרידמן מילטון"},
            {"en": "Friedman", "he": "פרידמן"},
            {"en": "Peres Shimon", "he": "פרס שמעון"},
            {"en": "Peres", "he": "פרס"},
            {"en": "Ciechanover Aharon", "he": "צ'חנובר אהרן"},
            {"en": "Ciechanover", "he": "צ'חנובר"},
            {"en": "Canetti Elias", "he": "קאנטי אליאס"},
            {"en": "Canetti", "he": "קאנטי"},
            {"en": "Cassin Rene", "he": "קאסין רנה"},
            {"en": "Cassin", "he": "קאסין"},
            {"en": "Kuznets Simon", "he": "קוזנץ שמעון"},
            {"en": "Kuznets", "he": "קוזנץ"},
            {"en": "Kissinger Henry", "he": "קיסינג'ר הנרי"},
            {"en": "Kissinger", "he": "קיסינג'ר"},
            {"en": "Klug Sir Aaron", "he": "קלוג סר אהרון"},
            {"en": "Klug", "he": "קלוג"},
            {"en": "Klein Lawrence", "he": "קליין לורנס"},
            {"en": "Klein", "he": "קליין"},
            {"en": "Kantorovich Leonid", "he": "קנטורוביץ ליאוניד"},
            {"en": "Kantorovich", "he": "קנטורוביץ"},
            {"en": "Rabbi Isidor Isaac", "he": "רבי איזידור איזק"},
            {"en": "Rabi", "he": "רבי"},
            {"en": "Richter Burton", "he": "ריכטר ברטון"},
            {"en": "Richter", "he": "ריכטר"},
            {"en": "Shira", "he": "שירה"},
            {"en": "Tehilla", "he": "תהילה"},
            {"en": "Boris Zamansky", "he": "בוריס זמנסקי"},
            {"en": "Zamansky", "he": "זמנסקי"},
            {"en": "Blaban Eliezer", "he": "בלבן אליעזר"},
            {"en": "Blaban", "he": "בלבן"},
            {"en": "Davidson", "he": "דוידזון"},
            {"en": "Rabbi Tzadok", "he": "הרב צדוק"},
            {"en": "Yakobzon Simcha", "he": "יעקובזון (שמחה)"},
            {"en": "Yakobzon", "he": "יעקובזון"},
            {"en": "Mishmar HaYarden", "he": "משמר הירדן"},
            {"en": "Segal Mordechai Yoel", "he": "סגל מרדכי יואל"},
            {"en": "Segal", "he": "סגל"},
            {"en": "Sofer Yaakov", "he": "סופר (יעקב)"},
            {"en": "Sofer", "he": "סופר"},
            {"en": "On Eagles' Wings", "he": "על כנפי נשרים"},
            {"en": "Popel Mordechai", "he": "פופל מרדכי"},
            {"en": "Popel", "he": "פופל"},
            {"en": "Pnina and Moshe Cohen", "he": "פנינה ומשה (כהן)"},
            {"en": "Pnina and Moshe", "he": "פנינה ומשה"},
            {"en": "Frank Zvi", "he": "פרנק צבי"},
            {"en": "Frank", "he": "פרנק"},
            {"en": "Reuven and Bat Sheva Segal", "he": "ראובן ובת שבע (סגל)"},
            {"en": "Reuven and Bat Sheva", "he": "ראובן ובת שבע"},
            {"en": "Usha", "he": "אושה"},
            {"en": "Eilon", "he": "אילון"},
            {"en": "Beit HaArava", "he": "בית הערבה"},
            {"en": "Beit Yehoshua", "he": "בית יהושע"},
            {"en": "Geulim", "he": "גאולים"},
            {"en": "Ginosar", "he": "גנוסר"},
            {"en": "Gesher", "he": "גשר"},
            {"en": "Dan", "he": "דן"},
            {"en": "HaZor'im", "he": "הזורעים"},
            {"en": "Hamadia", "he": "חמדיה"},
            {"en": "Hanita", "he": "חניתה"},
            {"en": "Tirat Zvi", "he": "טירת צבי"},
            {"en": "Kfar Hittim", "he": "כפר חטים"},
            {"en": "Kfar Masaryk", "he": "כפר מסריק"},
            {"en": "Machanayim", "he": "מחניים"},
            {"en": "Mesilot", "he": "מסילות"},
            {"en": "Maoz Chaim", "he": "מעוז חיים"},
            {"en": "Ma'ale HaHamisha", "he": "מעלה החמישה"},
            {"en": "Mishmar HaShlosha", "he": "משמר השלשה"},
            {"en": "Negba", "he": "נגבה"},
            {"en": "Nir David", "he": "ניר דוד"},
            {"en": "Ein Gev", "he": "עין גב"},
            {"en": "Ein HaMifratz", "he": "עין המפרץ"},
            {"en": "Amir", "he": "עמיר"},
            {"en": "Sde Eliyahu", "he": "שדה אליהו"},
            {"en": "Sde Warburg", "he": "שדה ורבורג"},
            {"en": "Sde Nachum", "he": "שדה נחום"},
            {"en": "Shadmot Devora", "he": "שדמות דבורה"},
            {"en": "Sha'ar HaGolan", "he": "שער הגולן"},
            {"en": "Sharona", "he": "שרונה"},
            {"en": "Tel Yitzhak", "he": "תל יצחק"},
            {"en": "Galili Israel", "he": "גלילי ישראל"},
            {"en": "Galili", "he": "גלילי"},
            {"en": "The General David", "he": "האלוף דוד"},
            {"en": "Eshkol", "he": "אשכול"},
            {"en": "Mishar", "he": "מיש\\"ר"},
            {"en": "Rosenblit Leo Dr.", "he": "רוזנבליט ליאו , ד\\"ר"},
            {"en": "Rosenblit", "he": "רוזנבליט"},
            {"en": "Sder HaTekuma", "he": "שד התקומה"},
            {"en": "The Grape Pickers", "he": "הבוצרים"},
            {"en": "The Stem", "he": "הגבעול"},
            {"en": "The Wine Press", "he": "הגת"},
            {"en": "The Grain", "he": "הדגן"},
            {"en": "The Vine Shoot", "he": "הזמורה"},
            {"en": "The Farmers", "he": "היוגבים"},
            {"en": "The Wine", "he": "היין"},
            {"en": "The Oil", "he": "היצהר"},
            {"en": "The Winery", "he": "היקב"},
            {"en": "The Vintners", "he": "הכורמים"},
            {"en": "The Sukkah", "he": "הסוכה"},
            {"en": "The Blossom", "he": "הסמדר"},
            {"en": "The Juice", "he": "העסיס"},
            {"en": "The Branch", "he": "השריג"},
            {"en": "The Must", "he": "התירוש"},
            {"en": "Boulevard of Righteous Among Nations", "he": "שדרת חסידי אומות העולם"},
            {"en": "The Watchtower", "he": "שומרה"},
            {"en": "Golda Meir", "he": "גולדה מאיר"},
            {"en": "Meir", "he": "מאיר"},
            {"en": "The Iris", "he": "האיריס"},
            {"en": "The Bulrush", "he": "הגומא"},
            {"en": "The Oleander", "he": "ההרדוף"},
            {"en": "The Buttercup", "he": "הזהבית"},
            {"en": "The Sternbergia", "he": "החלמונית"},
            {"en": "The Chrysanthemum", "he": "החרצית"},
            {"en": "The Jasmine", "he": "היסמין"},
            {"en": "The Hyacinth", "he": "היקינטון"},
            {"en": "The Celery", "he": "הכרפס"},
            {"en": "The Rockrose", "he": "הלוטם"},
            {"en": "The Myrtle", "he": "המורן"},
            {"en": "HaMar Zevulun", "he": "המר זבולון"},
            {"en": "The Cyclamen", "he": "המרגנית"},
            {"en": "The Water Lily", "he": "הנופר"},
            {"en": "The Buttercup", "he": "הנורית"},
            {"en": "The Narcissus", "he": "הנרקיס"},
            {"en": "The Groundsel", "he": "הסביון"},
            {"en": "The Orchid", "he": "הסחלב"},
            {"en": "The Violet", "he": "הסיגלית"},
            {"en": "The Autumn Crocus", "he": "הסיתוונית"},
            {"en": "The Bellflower", "he": "הפעמונית"},
            {"en": "The Poppy", "he": "הפרג"},
            {"en": "The Tulip", "he": "הצבעוני"},
            {"en": "The Carnation", "he": "הצפורן"},
            {"en": "The Broom", "he": "הרותם"},
            {"en": "The Lupine", "he": "התורמוס"},
            {"en": "The Clover", "he": "התלתן"},
            {"en": "Snapdragon", "he": "לוע הארי"},
            {"en": "Father of the Prisoners Rabbi Aryeh Levin", "he": "אבי האסירים (הרב אריה לוין)"},
            {"en": "Father of the Prisoners", "he": "אבי האסירים"},
            {"en": "Even Tamar", "he": "אבן תמר"},
            {"en": "Aguzi Mordechai Yaakov", "he": "אגוזי (מרדכי יעקב)"},
            {"en": "Aguzi", "he": "אגוזי"},
            {"en": "Aharon Amram", "he": "אהרון עמרם"},
            {"en": "Aharon", "he": "אהרון"},
            {"en": "Birger Yitzhak", "he": "בירגר יצחק"},
            {"en": "Birger", "he": "בירגר"},
            {"en": "Ben Yehuda Eliezer", "he": "בן יהודה (אליעזר)"},
            {"en": "Ben Yehuda", "he": "בן יהודה"},
            {"en": "Ben Pinchas David", "he": "בן פנחס (דוד)"},
            {"en": "Ben Pinchas", "he": "בן פנחס"},
            {"en": "Bar Ilan Meir Rabbi", "he": "בר אילן (מאיר, הרב)"},
            {"en": "Bar Ilan", "he": "בר אילן"},
            {"en": "Gluskin Ze'ev", "he": "גלוסקין (זאב)"},
            {"en": "Gluskin", "he": "גלוסקין"},
            {"en": "Dr. Elyakim Ostashinsky", "he": "ד\\"ר אליקום (אוסטשינסקי)"},
            {"en": "Dr. Elyakim", "he": "ד\\"ר אליקום"},
            {"en": "The Ostashinsky Brothers", "he": "האחים אוסטשינסקי"},
            {"en": "The Weinberg Brothers", "he": "האחים וינברג"},
            {"en": "The ARI", "he": "האר\\"י"},
            {"en": "The Baal Shem Tov", "he": "הבעל שם טוב"},
            {"en": "The Carmel", "he": "הכרמל"},
            {"en": "The Poet Shalom Shabazi", "he": "המשורר שלום (שבזי)"},
            {"en": "The Netziv of Volozhin", "he": "הנצי\\"ב מוולוז'ין"},
            {"en": "The Palmach", "he": "הפלמ\\"ח"},
            {"en": "Rabbi Nissim", "he": "הרב ניסים"},
            {"en": "Chisin Chaim Dr. and Pnina", "he": "חיסין (חיים, ד\\"ר ופניה)"},
            {"en": "Chisin", "he": "חיסין"},
            {"en": "Hankin Yehoshua Leib", "he": "חנקין (יהושע לייב)"},
            {"en": "Hankin", "he": "חנקין"},
            {"en": "Tehon Yaakov Yohanan Rabbi", "he": "טהון (יעקב יוחנן, הרב)"},
            {"en": "Tehon", "he": "טהון"},
            {"en": "Tyomkin Ze'ev", "he": "טיומקין (זאב)"},
            {"en": "Tyomkin", "he": "טיומקין"},
            {"en": "Yellin David", "he": "ילין (דוד)"},
            {"en": "Yellin", "he": "ילין"},
            {"en": "Yaakov Nehemi", "he": "יעקב נהמי"},
            {"en": "Levi Yitzhak of Berdichev", "he": "לוי יצחק מברדיצ'ב"},
            {"en": "Musal Yitzhak", "he": "מוסאל יצחק"},
            {"en": "Musal", "he": "מוסאל"},
            {"en": "Machali HaLevi", "he": "מחלי הלוי"},
            {"en": "Neve Zion", "he": "נווה ציון"},
            {"en": "Nordau", "he": "נורדאו"},
            {"en": "Sokolov Nachum", "he": "סוקולוב (נחום)"},
            {"en": "Sokolov", "he": "סוקולוב"},
            {"en": "Siminovski Moshe", "he": "סימינובסקי משה"},
            {"en": "Siminovski", "he": "סימינובסקי"},
            {"en": "Alley of Gan Nachum", "he": "סמטת גן נחום"},
            {"en": "Alley of Friendship", "he": "סמטת הרעות"},
            {"en": "Smilansky Moshe", "he": "סמילנסקי (משה)"},
            {"en": "Smilansky", "he": "סמילנסקי"},
            {"en": "Pochachevsky Michal", "he": "פוחצ'בסקי מיכל"},
            {"en": "Pochachevsky", "he": "פוחצ'בסקי"},
            {"en": "Peis David", "he": "פייס (דוד)"},
            {"en": "Peis", "he": "פייס"},
            {"en": "Pinchasovitz Mordechai", "he": "פנחסוביץ' (מרדכי)"},
            {"en": "Pinchasovitz", "he": "פנחסוביץ'"},
            {"en": "Prof. Gavriahu Chaim M.Y.", "he": "פרופ' גבריהו (חיים מ'י')"},
            {"en": "Prof. Gavriahu", "he": "פרופ' גבריהו"},
            {"en": "Chernov Yitzhak", "he": "צ'רנוב (יצחק)"},
            {"en": "Chernov", "he": "צ'רנוב"},
            {"en": "Karon Aharon", "he": "קרון אהרון"},
            {"en": "Karon", "he": "קרון"},
            {"en": "Karlen Peretz", "he": "קרלן פרץ"},
            {"en": "Karlen", "he": "קרלן"},
            {"en": "Rosenthal Zvi", "he": "רוזנטל צבי"},
            {"en": "Rosenthal", "he": "רוזנטל"},
            {"en": "Ruppin Arthur Dr.", "he": "רופין (ארתור, ד\\"ר)"},
            {"en": "Ruppin", "he": "רופין"},
            {"en": "Reines Yitzhak Yaakov Rabbi", "he": "ריינס (יצחק יעקב, הרב)"},
            {"en": "Reines", "he": "ריינס"},
            {"en": "Avidan Shimon", "he": "אבידן שמעון"},
            {"en": "Avidan", "he": "אבידן"},
            {"en": "Olga and Yehoshua Hankin", "he": "אולגה ויהושע (חנקין)"},
            {"en": "Olga and Yehoshua", "he": "אולגה ויהושע"},
            {"en": "Eliraz Shlomo", "he": "אלירז שלמה"},
            {"en": "Eliraz", "he": "אלירז"},
            {"en": "Bar Kochba", "he": "בר כוכבא"},
            {"en": "BaTalem", "he": "בתלם"},
            {"en": "Goldberg the Benefactor", "he": "גולדברג הנדבן"},
            {"en": "Gush Chalav", "he": "גוש חלב"},
            {"en": "Gershuni Aryeh", "he": "גרשוני אריה"},
            {"en": "Gershuni", "he": "גרשוני"},
            {"en": "David Elazar", "he": "דוד אלעזר"},
            {"en": "Elazar", "he": "אלעזר"},
            {"en": "Dori", "he": "דורי"},
            {"en": "The Eleven", "he": "האחד עשר"},
            {"en": "The Training Groups", "he": "ההכשרות"},
            {"en": "The Hasmoneans", "he": "שמונאים"},
            {"en": "The Nahal", "he": "הנח\\"ל"},
            {"en": "Rabbi Trovitz Shmuel", "he": "הרב טרוביץ (שמואל)"},
            {"en": "Rabbi Trovitz", "he": "הרב טרוביץ"},
            {"en": "Hatzor", "he": "חצור"},
            {"en": "Yair", "he": "יאיר"},
            {"en": "Yellin Aviezer", "he": "ילין אביעזר"},
            {"en": "Israel and Fanny Feinberg", "he": "ישראל ופאני (פיינברג)"},
            {"en": "Israel and Fanny", "he": "ישראל ופאני"},
            {"en": "Cohen Yoel", "he": "כהן יואל"},
            {"en": "Modi'in Square", "he": "כיכר מודיעין"},
            {"en": "Levin Michael and Chana", "he": "לוין מיכאל וחנה"},
            {"en": "Levin", "he": "לוין"},
            {"en": "Me'unit", "he": "מענית"},
            {"en": "Masada", "he": "מצדה"},
            {"en": "Nirim", "he": "נירים"},
            {"en": "Netzer Sereni", "he": "נצר סירני"},
            {"en": "Segis Yehuda", "he": "סגיס יהודה"},
            {"en": "Segis", "he": "סגיס"},
            {"en": "Ezer Weizmann", "he": "עזר (ויצמן)"},
            {"en": "Ezer", "he": "עזר"},
            {"en": "Ein Dor", "he": "עין דור"},
            {"en": "Ein HaNetziv", "he": "עין הנצי\\"ב"},
            {"en": "Pein Nachman", "he": "פיין נחמן"},
            {"en": "Pein", "he": "פיין"},
            {"en": "Kaliv", "he": "קאליב"},
            {"en": "Kotzer Aryeh", "he": "קוצר אריה"},
            {"en": "Kotzer", "he": "קוצר"},
            {"en": "Klausner Yosef", "he": "קלוזנר יוסף"},
            {"en": "Klausner", "he": "קלוזנר"},
            {"en": "Ron Chaim", "he": "רון חיים"},
            {"en": "Ron", "he": "רון"},
            {"en": "Rafool", "he": "רפול"},
            {"en": "Rafael Eitan", "he": "רפאל איתן"},
            {"en": "Shlomo Povemborovsky", "he": "שלמה (פובמבורובסקי)"},
            {"en": "Shlomo", "he": "שלמה"},
            {"en": "Sharir Shmuel", "he": "שרירא שמואל"},
            {"en": "Sharir", "he": "שרירא"},
            {"en": "Sharaf Chaim", "he": "שרף חיים"},
            {"en": "Sharaf", "he": "שרף"},
            {"en": "Abarbanel Don Yitzhak", "he": "אברבנאל (דון יצחק)"},
            {"en": "Abarbanel", "he": "אברבנאל"},
            {"en": "Ur Kasdim", "he": "אור כשדים"},
            {"en": "Ahad HaAm", "he": "אחד העם"},
            {"en": "Achizeir", "he": "אחיעזר"},
            {"en": "Eisenband Levi Yitzhak", "he": "אייזנבנד (לוי יצחק)"},
            {"en": "Eisenband", "he": "אייזנבנד"},
            {"en": "Itamar Ben Avi", "he": "איתמר בן אב\\"י"},
            {"en": "Alkalai Yehuda Rabbi", "he": "אלקלעי (יהודה, הרב)"},
            {"en": "Alkalai", "he": "אלקלעי"},
            {"en": "Alroy David", "he": "אלרואי (דוד)"},
            {"en": "Alroy", "he": "אלרואי"},
            {"en": "Aryeh Rafael", "he": "אריה רפאל"},
            {"en": "Aryeh", "he": "אריה"},
            {"en": "Beit Yosef", "he": "בית יוסף"},
            {"en": "Balfour", "he": "בלפור"},
            {"en": "Ben Aharon Orfali Tzadok", "he": "בן אהרון אורפלי צדוק"},
            {"en": "Ben Aharon", "he": "בן אהרון"},
            {"en": "Ben Ze'ev Shimon", "he": "בן זאב (שמעון)"},
            {"en": "Ben Ze'ev", "he": "בן זאב"},
            {"en": "Brook Chaim Shaul Rabbi", "he": "ברוק (חיים שאול, הרב)"},
            {"en": "Brook", "he": "ברוק"},
            {"en": "Brandeis The Judge", "he": "ברנדיס (השופט)"},
            {"en": "Brandeis", "he": "ברנדיס"},
            {"en": "Barash Asher", "he": "ברש אשר"},
            {"en": "Barash", "he": "ברש"},
            {"en": "Givati", "he": "גבעתי"},
            {"en": "Gush Etzion", "he": "גוש עציון"},
            {"en": "Degania", "he": "דגניה"},
            {"en": "David the Secretary", "he": "דוד המזכיר"},
            {"en": "Dror", "he": "דרור"},
            {"en": "The Aviov Brothers", "he": "האחים אביוב"},
            {"en": "The Solomon Brothers", "he": "האחים סולימן"},
            {"en": "The Gaon of Vilna", "he": "הגאון מוילנה"},
            {"en": "The Hebrew Battalion", "he": "הגדוד העברי"},
            {"en": "The Chafetz Chaim", "he": "החפץ חיים"},
            {"en": "Heisman Shraga Feivel", "he": "הייסמן (שרגא פייבל)"},
            {"en": "Heisman", "he": "הייסמן"},
            {"en": "HaKovesh", "he": "הכובש"},
            {"en": "The Kuzari", "he": "הכוזרי"},
            {"en": "HaLevi Yosef", "he": "הלוי (יוסף)"},
            {"en": "HaLevi", "he": "הלוי"},
            {"en": "The Negev", "he": "הנגב"},
            {"en": "The Reubeni David", "he": "הראובני דוד"},
            {"en": "Rabbi Herzog", "he": "הרב הרצוג"},
            {"en": "Rabbi Singer", "he": "הרב זינגר"},
            {"en": "Rabbi Charlap Chaim Zevulun", "he": "הרב חרל\\"פ (חיים זבולון)"},
            {"en": "Rabbi Charlap", "he": "הרב חרל\\"פ"},
            {"en": "Rabbi Maimon", "he": "הרב מימון"},
            {"en": "Rabbi Sibahi", "he": "הרב סיבהי"},
            {"en": "Rabbi Uziel Ben Zion", "he": "הרב עוזיאל (בן ציון)"},
            {"en": "Rabbi Uziel", "he": "הרב עוזיאל"},
            {"en": "Rabbi Kook", "he": "הרב קוק"},
            {"en": "Vigodsky Eliyahu", "he": "ויגודסקי (אליהו)"},
            {"en": "Vigodsky", "he": "ויגודסקי"},
            {"en": "Wise Stephen", "he": "וייז סטפן"},
            {"en": "Wise", "he": "וייז"},
            {"en": "Weitzberd Elyakim", "he": "ויצברד (אליקים)"},
            {"en": "Weitzberd", "he": "ויצברד"},
            {"en": "Vitkin Yosef", "he": "ויתקין (יוסף)"},
            {"en": "Vitkin", "he": "ויתקין"},
            {"en": "Veksler Moshe", "he": "וכסלר (משה)"},
            {"en": "Veksler", "he": "וכסלר"},
            {"en": "ZDL Zalman David Levontin", "he": "זד\\"ל (זלמן דוד לבונטין)"},
            {"en": "ZDL", "he": "זד\\"ל"},
            {"en": "Chabad", "he": "חב\\"ד"},
            {"en": "Chazon Ish", "he": "חזון איש"},
            {"en": "Kiryati Brigade", "he": "חטיבת קרייתי"},
            {"en": "CHISH", "he": "חי\\"ש"},
            {"en": "Yehuda Amchislavsky", "he": "יהודה (אמצ'יסלבסקי)"},
            {"en": "Yehuda", "he": "יהודה"},
            {"en": "Yehuda HaLevi", "he": "יהודה הלוי"},
            {"en": "Yehuda Leib Pinsker", "he": "יהודה לייב (פינסקר)"},
            {"en": "Yehuda Leib", "he": "יהודה לייב"},
            {"en": "Yochanan the Cobbler", "he": "יוחנן הסנדלר"},
            {"en": "Founders Square", "he": "כיכר המייסדים"},
            {"en": "Levin Asher", "he": "לוין אשר"},
            {"en": "Mohilever", "he": "מוהליבר"},
            {"en": "Molcho Shlomo", "he": "מולכו שלמה"},
            {"en": "Molcho", "he": "מולכו"},
            {"en": "Mizrahi Moshe", "he": "מזרחי משה"},
            {"en": "Mizrahi", "he": "מזרחי"},
            {"en": "Maklef", "he": "מקלף"},
            {"en": "Margolin the Colonel", "he": "מרגולין הקולונל"},
            {"en": "Margolin", "he": "מרגולין"},
            {"en": "Masuot Yitzhak", "he": "משואות יצחק"},
            {"en": "Naharayim", "he": "נהריים"},
            {"en": "Nachama Pochachevsky", "he": "נחמה (פוחצ'בסקי)"},
            {"en": "Nachama", "he": "נחמה"},
            {"en": "Alley of Bezalel", "he": "סמטת בצלאל"},
            {"en": "Alley of Barkovitz", "he": "סמטת ברקוביץ'"},
            {"en": "Senior David", "he": "סניור (דוד)"},
            {"en": "Senior", "he": "סניור"},
            {"en": "Atarot", "he": "עטרות"},
            {"en": "Ein Tzurim", "he": "עין צורים"},
            {"en": "Par Zalkind", "he": "פאר זלקינד"},
            {"en": "Par", "he": "פאר"},
            {"en": "Feinberg Yosef", "he": "פיינברג יוסף"},
            {"en": "Feinberg", "he": "פיינברג"},
            {"en": "Fishlson Yaakov Dov", "he": "פישלזון (יעקב דב)"},
            {"en": "Fishlson", "he": "פישלזון"},
            {"en": "Parsol Naomi", "he": "פרסול נעמי"},
            {"en": "Parsol", "he": "פרסול"},
            {"en": "93 Girls", "he": "צ\\"ג בנות"},
            {"en": "Karo Yosef", "he": "קארו יוסף"},
            {"en": "Karo", "he": "קארו"},
            {"en": "Kozi Yosef", "he": "קוזי יוסף"},
            {"en": "Kozi", "he": "קוזי"},
            {"en": "Kiddush HaShem", "he": "קידוש השם"},
            {"en": "Klivitzky Shaul and Atara", "he": "קליביצקי שאול ועטרה"},
            {"en": "Klivitzky", "he": "קליביצקי"},
            {"en": "Kritchevsky Meir", "he": "קריצ'בסקי (מאיר)"},
            {"en": "Kritchevsky", "he": "קריצ'בסקי"},
            {"en": "Revadim", "he": "רבדים"},
            {"en": "Ragonis Yehuda", "he": "רגוניס יהודה"},
            {"en": "Ragonis", "he": "רגוניס"},
            {"en": "Rosenstein Motela Mordechai", "he": "רוזנשטיין (מוטל'ה) מרדכי"},
            {"en": "Rosenstein", "he": "רוזנשטיין"},
            {"en": "Rambam", "he": "רמב\\"ם"},
            {"en": "Rashi Shlomo Yitzhak Rabbi", "he": "רש\\"י (שלמה יצחק, הרב)"},
            {"en": "Rashi", "he": "רש\\"י"},
            {"en": "Path of Alonim", "he": "שביל אלונים"},
            {"en": "Shabbat Achim", "he": "שבת אחים"},
            {"en": "Sagi Yehuda", "he": "שגיא יהודה"},
            {"en": "Sagi", "he": "שגיא"},
            {"en": "Shulman Zvi", "he": "שולמן צבי"},
            {"en": "Shulman", "he": "שולמן"},
            {"en": "Sarah and Eliyahu Kaplan", "he": "שרה ואליהו (קפלן)"},
            {"en": "Sarah and Eliyahu", "he": "שרה ואליהו"},
            {"en": "Tanhum Zamsky", "he": "תנחום (זמסקי)"},
            {"en": "Tanhum", "he": "תנחום"},
            {"en": "Barad Avraham", "he": "באראד (אברהם)"},
            {"en": "Barad", "he": "באראד"},
            {"en": "Ben Eliezer Aryeh", "he": "בן אליעזר (אריה)"},
            {"en": "Ben Eliezer", "he": "בן אליעזר"},
            {"en": "Bernitzki Natan", "he": "ברניצקי (נתן)"},
            {"en": "Bernitzki", "he": "ברניצקי"},
            {"en": "Gur Gershovsky", "he": "גור (גרזובסקי)"},
            {"en": "Gur", "he": "גור"},
            {"en": "Drobin Yoel", "he": "דרובין (יואל)"},
            {"en": "Drobin", "he": "דרובין"},
            {"en": "The Smilchansky Brothers", "he": "האחים סמילצ'נסקי"},
            {"en": "The Mother", "he": "האם"},
            {"en": "The First Son", "he": "הבן הראשון"},
            {"en": "The Bashan", "he": "הבשן"},
            {"en": "The Galilee", "he": "הגליל"},
            {"en": "The Gilead", "he": "הגלעד"},
            {"en": "The Vine", "he": "הגפן"},
            {"en": "The Citrus", "he": "ההדרים"},
            {"en": "Horowitz Gershon", "he": "הורוביץ (גרשון)"},
            {"en": "Horowitz", "he": "הורוביץ"},
            {"en": "The Olive", "he": "הזית"},
            {"en": "The Chida Chaim Yosef David Azulai", "he": "החיד\\"א (חיים יוסף דוד אזולאי)"},
            {"en": "The Chida", "he": "החיד\\"א"},
            {"en": "The Hermon", "he": "החרמון"},
            {"en": "The Jordan", "he": "הירדן"},
            {"en": "The Yarmuk", "he": "הירמוך"},
            {"en": "The Yarkon", "he": "הירקון"},
            {"en": "Hirschfeld Zvi", "he": "הירשפלד (צבי)"},
            {"en": "Hirschfeld", "he": "הירשפלד"},
            {"en": "The Kishon", "he": "הקישון"},
            {"en": "Rabbi Yanovsky", "he": "הרב ינובסקי"},
            {"en": "The Pomegranate", "he": "הרימון"},
            {"en": "The Field", "he": "השדה"},
            {"en": "The Almond", "he": "השקד"},
            {"en": "The Sycamore", "he": "השקמה"},
            {"en": "The Fig", "he": "התאנה"},
            {"en": "The Date Palm", "he": "התומר"},
            {"en": "Wolfson David", "he": "וולפסון (דוד)"},
            {"en": "Wolfson", "he": "וולפסון"},
            {"en": "Vinnik Meir", "he": "ויניק (מאיר)"},
            {"en": "Vinnik", "he": "ויניק"},
            {"en": "Yavnieli Shmuel", "he": "יבניאלי (שמואל)"},
            {"en": "Yavnieli", "he": "יבניאלי"},
            {"en": "Yarboim Mordechai", "he": "יברבוים (מרדכי)"},
            {"en": "Yarboim", "he": "יברבוים"},
            {"en": "Kinneret", "he": "כנרת"},
            {"en": "Nahal Sorek", "he": "נחל שורק"},
            {"en": "Alumim", "he": "עלומים"},
            {"en": "Pein Binyamin", "he": "פיין בנימין"},
            {"en": "Chelnov Yechiel Dr.", "he": "צ'לנוב (יחיאל ד\\"ר)"},
            {"en": "Chelnov", "he": "צ'לנוב"},
            {"en": "Tlalichin Yehuda", "he": "צלליכין (יהודה)"},
            {"en": "Tlalichin", "he": "צלליכין"},
            {"en": "Kaplansky Shlomo Dr.", "he": "קפלנסקי (שלמה ד\\"ר)"},
            {"en": "Kaplansky", "he": "קפלנסקי"},
            {"en": "Reuven Yudilovich", "he": "ראובן (יודילוביץ')"},
            {"en": "Reuven", "he": "ראובן"},
            {"en": "Ruzin Zalman-Levi and Shoshana", "he": "רוזין (זלמן-לוי ושושנה)"},
            {"en": "Ruzin", "he": "רוזין"},
            {"en": "Rot Yaakov", "he": "רוט יעקב"},
            {"en": "Rot", "he": "רוט"},
            {"en": "Sderot Zamsky Meir", "he": "שד' זמסקי מאיר"},
            {"en": "Sderot Zamsky", "he": "שד' זמסקי"},
            {"en": "Sde Yitzhak", "he": "שדה יצחק"},
            {"en": "Boulevard of 1948", "he": "שדרת תש\\"ח"},
            {"en": "Shochet Manya", "he": "שוחט מניה"},
            {"en": "Shochet", "he": "שוחט"},
            {"en": "Shapetal Aryeh", "he": "שפטל אריה"},
            {"en": "Shapetal", "he": "שפטל"},
            {"en": "Sprinzak Yosef", "he": "שפרינצק (יוסף)"},
            {"en": "Sprinzak", "he": "שפרינצק"},
            {"en": "Abu Chatzira Yitzhak Rabbi", "he": "אבו חצירא (יצחק, הרב)"},
            {"en": "Abu Chatzira", "he": "אבו חצירא"},
            {"en": "Aharonson Aharon", "he": "אהרנסון אהרון"},
            {"en": "Aharonson", "he": "אהרנסון"},
            {"en": "Azoulay David", "he": "אזולאי דוד"},
            {"en": "Azoulay", "he": "אזולאי"},
            {"en": "Anielewicz Mordechai", "he": "אנילביץ' (מרדכי)"},
            {"en": "Anielewicz", "he": "אנילביץ'"},
            {"en": "Ariav Chaim", "he": "אריאב (חיים)"},
            {"en": "Ariav", "he": "אריאב"},
            {"en": "Arnon Moshe", "he": "ארנון משה"},
            {"en": "Arnon", "he": "ארנון"},
            {"en": "Ash Shalom", "he": "אש שלום"},
            {"en": "Ash", "he": "אש"},
            {"en": "Ben Zvi Yitzhak", "he": "בן צבי (יצחק)"},
            {"en": "Ben Zvi", "he": "בן צבי"},
            {"en": "Golinkin Mordechai", "he": "גולינקין (מרדכי)"},
            {"en": "Golinkin", "he": "גולינקין"},
            {"en": "Garmi Rachel", "he": "גרמי רחל"},
            {"en": "Garmi", "he": "גרמי"},
            {"en": "King David", "he": "דוד המלך"},
            {"en": "Derech Israel Yeshayahu", "he": "דרך ישראל ישעיהו"},
            {"en": "The Pioneer", "he": "החלוץ"},
            {"en": "The Knesset", "he": "הכנסת"},
            {"en": "HaTzefira", "he": "הצפירה"},
            {"en": "Rabbi Ivgi Moshe", "he": "הרב איבגי משה"},
            {"en": "Rabbi Ivgi", "he": "הרב איבגי"},
            {"en": "Rabbi Hadad Chaim", "he": "הרב חדד חיים"},
            {"en": "Rabbi Hadad", "he": "הרב חדד"},
            {"en": "Rabbi Mintz Binyamin", "he": "הרב מינץ (בנימין)"},
            {"en": "Rabbi Mintz", "he": "הרב מינץ"},
            {"en": "Rabbi Nurock", "he": "הרב נורוק"},
            {"en": "Rabbi Ozery Saadia", "he": "הרב עוזרי (סעדיה)"},
            {"en": "Rabbi Ozery", "he": "הרב עוזרי"},
            {"en": "Rabbi Shimoni Mordechai", "he": "הרב שמעוני מרדכי"},
            {"en": "Rabbi Shimoni", "he": "הרב שמעוני"},
            {"en": "The Judges", "he": "השופטים"},
            {"en": "Wilensky Wolf", "he": "וילנסקי וולף"},
            {"en": "Wilensky", "he": "וילנסקי"},
            {"en": "Zeiner David and Yaffa", "he": "זינר דוד ויפה"},
            {"en": "Zeiner", "he": "זינר"},
            {"en": "Cohen Yaakov", "he": "כהן יעקב"},
            {"en": "Yitzhak Rabin Square", "he": "כיכר יצחק רבין"},
            {"en": "Kings of Israel", "he": "מלכי ישראל"},
            {"en": "Poet of the Holocaust", "he": "משורר השואה"},
            {"en": "Natan Shlomo", "he": "נתן שלמה"},
            {"en": "Natan", "he": "נתן"},
            {"en": "Silver Abba Hillel", "he": "סילבר (אבא הלל)"},
            {"en": "Silver", "he": "סילבר"},
            {"en": "Szenes Chana", "he": "סנש חנה"},
            {"en": "Szenes", "he": "סנש"},
            {"en": "The Three Ship", "he": "ספינת השלושה"},
            {"en": "Ezra VeBitzaron", "he": "עזרה ובצרון"},
            {"en": "Poznansky Menachem", "he": "פוזננסקי (מנחם)"},
            {"en": "Poznansky", "he": "פוזננסקי"},
            {"en": "Pearl of the Sea", "he": "פנינת הים"},
            {"en": "Zeitlin Hillel", "he": "צייטלין (הלל)"},
            {"en": "Zeitlin", "he": "צייטלין"},
            {"en": "Tzarfati Esther Estherina", "he": "צרפתי אסתר (אסתרינה)"},
            {"en": "Tzarfati", "he": "צרפתי"},
            {"en": "New Jersey Community", "he": "קהילת ניו ג'רסי"},
            {"en": "Korczak Janusz", "he": "קורצ'אק יאנוש"},
            {"en": "Korczak", "he": "קורצ'אק"},
            {"en": "Shai Agnon", "he": "ש\\"י עגנון"},
            {"en": "Agnon", "he": "עגנון"},
            {"en": "King Saul", "he": "שאול המלך"},
            {"en": "Sderot Shneor Zalman", "he": "שד' שניאור זלמן"},
            {"en": "Sderot Shneor", "he": "שד' שניאור"},
            {"en": "King Solomon", "he": "שלמה המלך"},
            {"en": "Samuel the Prophet", "he": "שמואל הנביא"},
            {"en": "Tidhar David", "he": "תדהר (דוד)"},
            {"en": "Tidhar", "he": "תדהר"},
            {"en": "Torah VeAvoda", "he": "תורה ועבודה"},
            {"en": "Orna Porat", "he": "אורנה פורת"},
            {"en": "Porat", "he": "פורת"},
            {"en": "Ephraim Kishon", "he": "אפרים קישון"},
            {"en": "Kishon", "he": "קישון"},
            {"en": "Arik Einstein", "he": "אריק איינשטיין"},
            {"en": "Einstein", "he": "איינשטיין"},
            {"en": "Dudu Dotan", "he": "דודו דותן"},
            {"en": "Dotan", "he": "דותן"},
            {"en": "Chaim Hefer", "he": "חיים חפר"},
            {"en": "Hefer", "he": "חפר"},
            {"en": "Yaakov Ben Sira", "he": "יעקב בן סירא"},
            {"en": "Ben Sira", "he": "בן סירא"},
            {"en": "Uzi Chitman", "he": "עוזי חיטמן"},
            {"en": "Chitman", "he": "חיטמן"},
            {"en": "Avner Meir Dr.", "he": "אבנר מאיר, ד\\"ר"},
            {"en": "Avner Meir", "he": "אבנר מאיר"},
            {"en": "Ehud Ben Gera", "he": "אהוד (בן גרא)"},
            {"en": "Ehud", "he": "אהוד"},
            {"en": "Aharon HaCohen", "he": "אהרון הכהן"},
            {"en": "Osnat Barzani", "he": "אוסנת ברזאני"},
            {"en": "Barzani", "he": "ברזאני"},
            {"en": "Ish Matzlach", "he": "איש מצליח"},
            {"en": "Alfasi Yitzhak Ben Yaakov", "he": "אלפסי (יצחק בן יעקב)"},
            {"en": "Alfasi", "he": "אלפסי"},
            {"en": "Alfred Mordechai", "he": "אלפרד מרדכי"},
            {"en": "Alfred", "he": "אלפרד"},
            {"en": "Prisoners of Zion", "he": "אסירי ציון"},
            {"en": "Ashchar", "he": "אשחר"},
            {"en": "Ben Zakai Yochanan", "he": "בן זכאי (יוחנן)"},
            {"en": "Ben Zakai", "he": "בן זכאי"},
            {"en": "Barak Ben Avinoam", "he": "ברק (בן אבינועם)"},
            {"en": "Barak", "he": "ברק"},
            {"en": "Gideon Ben Yoash", "he": "גדעון (בן יואש)"},
            {"en": "Gideon", "he": "גדעון"},
            {"en": "Gerizim", "he": "גריזים"},
            {"en": "D'Arbela", "he": "ד'ארבלה"},
            {"en": "Deborah the Prophetess", "he": "דבורה הנביאה"},
            {"en": "Dvoranit", "he": "דבורנית"},
            {"en": "Daniel the Prophet", "he": "דניאל הנביא"},
            {"en": "The Walnut", "he": "האגוז"},
            {"en": "The Pine", "he": "האורן"},
            {"en": "The Terebinth", "he": "האלה"},
            {"en": "The Oak", "he": "האלון"},
            {"en": "The Amoraim", "he": "האמוראים"},
            {"en": "The Cedar", "he": "הארז"},
            {"en": "The Tamarisk", "he": "האשל"},
            {"en": "The Etrog", "he": "האתרוג"},
            {"en": "The Cypress", "he": "הברוש"},
            {"en": "The Mandrakes", "he": "הדודאים"},
            {"en": "The Palm", "he": "הדקל"},
            {"en": "The Myrtle", "he": "ההדס"},
            {"en": "The Rose", "he": "הורד"},
            {"en": "The Nightingale", "he": "הזמיר"},
            {"en": "The Lily", "he": "החבצלת"},
            {"en": "The Grove", "he": "החורש"},
            {"en": "The Carob", "he": "החרוב"},
            {"en": "The Anemone", "he": "הכלנית"},
            {"en": "The Crocus", "he": "הכרכם"},
            {"en": "The Lulav", "he": "הלולב"},
            {"en": "The Poplar", "he": "הליבנה"},
            {"en": "The Maharal of Prague", "he": "המהר\\"ל מפראג"},
            {"en": "The Ma'apilim", "he": "המעפילים"},
            {"en": "The Prophets", "he": "הנביאים"},
            {"en": "The Notrim", "he": "הנוטרים"},
            {"en": "The Aliyah", "he": "העליה"},
            {"en": "The Willow", "he": "הערבה"},
            {"en": "The Flower", "he": "הפרח"},
            {"en": "The Acacia", "he": "הצאלים"},
            {"en": "The Zealots", "he": "הקנאים"},
            {"en": "Mount Moriah", "he": "הר המוריה"},
            {"en": "Mount Sinai", "he": "הר סיני"},
            {"en": "Rabbi Zecharia Pinchas", "he": "הרב זכריה פנחס"},
            {"en": "Rabbi Zecharia", "he": "הרב זכריה"},
            {"en": "Rabbi Chayon Gedaliah", "he": "הרב חיון גדליה"},
            {"en": "Rabbi Chayon", "he": "הרב חיון"},
            {"en": "Rabbi Chaim David HaLevi", "he": "הרב חיים דוד הלוי"},
            {"en": "Rabbi Chaim David", "he": "הרב חיים דוד"},
            {"en": "Rabbi Tayeb Yitzhak", "he": "הרב טייב (יצחק)"},
            {"en": "Rabbi Tayeb", "he": "הרב טייב"},
            {"en": "The Cyclamen", "he": "הרקפת"},
            {"en": "The Plum", "he": "השזיף"},
            {"en": "The Acacia", "he": "השיטה"},
            {"en": "The Tannaim", "he": "התנאים"},
            {"en": "The Apple", "he": "התפוח"},
            {"en": "Ze'ev Ginzburg", "he": "זאב (גינזבורג)"},
            {"en": "Ze'ev", "he": "זאב"},
            {"en": "Zerubavel Ben Shealtiel", "he": "זרובבל (בן שאלתיאל)"},
            {"en": "Zerubavel", "he": "זרובבל"},
            {"en": "Chagai the Prophet", "he": "חגי הנביא"},
            {"en": "Yona the Prophet", "he": "יונה הנביא"},
            {"en": "Yosef HaNasi", "he": "יוסף הנשיא"},
            {"en": "Ezekiel the Prophet", "he": "יחזקאל הנביא"},
            {"en": "Yiftach the Gileadite", "he": "יפתח הגלעדי"},
            {"en": "Yiftach", "he": "יפתח"},
            {"en": "Jeremiah the Prophet", "he": "ירמיהו הנביא"},
            {"en": "Isaiah the Prophet", "he": "ישעיהו הנביא"},
            {"en": "Border Police Square", "he": "כיכר מג\\"ב"},
            {"en": "Mavo Yisur", "he": "מבוא ישורון"},
            {"en": "Ghetto Rebels", "he": "מורדי הגטאות"},
            {"en": "Malachi", "he": "מלאכי"},
            {"en": "Morocco Ma'apilim", "he": "מעפילי מרוקו"},
            {"en": "Magic Carpet", "he": "מרבד הקסמים"},
            {"en": "Pathway Yizre'el", "he": "משעול יזרעאל"},
            {"en": "Pathway Canaan", "he": "משעול כנען"},
            {"en": "Pathway Cyprus Ma'apilim", "he": "משעול מעפילי קפריסין"},
            {"en": "Nehemiah", "he": "נחמיה"},
            {"en": "Struma", "he": "סטרומה"},
            {"en": "Saadia Gaon", "he": "סעדיה גאון"},
            {"en": "Ovadia", "he": "עובדיה"},
            {"en": "Ezra", "he": "עזרא"},
            {"en": "Amos the Prophet", "he": "עמוס הנביא"},
            {"en": "Patria", "he": "פטריה"},
            {"en": "Zephaniah the Prophet", "he": "צפניה הנביא"},
            {"en": "Korinit", "he": "קורנית"},
            {"en": "RABE", "he": "ראב\\"ע"},
            {"en": "Rabbi Tarfon", "he": "רבי טרפון"},
            {"en": "Rabbi Meir", "he": "רבי מאיר"},
            {"en": "Rabbi Nechemia Mota", "he": "רבי נחמיה מוטא"},
            {"en": "Rabbi Akiva", "he": "רבי עקיבא"},
            {"en": "Rabbeinu Tam", "he": "רבנו תם"},
            {"en": "Radak", "he": "רד\\"ק"},
            {"en": "Tribes of Israel", "he": "שבטי ישראל"},
            {"en": "Sderot Yaakov Gerufi", "he": "שד' יעקב (ג'רופי)"},
            {"en": "Sderot Yaakov", "he": "שד' יעקב"},
            {"en": "Shur Kalman", "he": "שור קלמן"},
            {"en": "Shur", "he": "שור"},
            {"en": "Shamgar Ben Anat", "he": "שמגר (בן ענת)"},
            {"en": "Shamgar", "he": "שמגר"},
            {"en": "Sharabi Shalom Rabbi", "he": "שרעבי שלום, הרב"},
            {"en": "Sharabi", "he": "שרעבי"},
            {"en": "Tal David", "he": "טל דוד"},
            {"en": "Tal", "he": "טל"}
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
