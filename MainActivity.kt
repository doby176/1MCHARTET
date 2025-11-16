package com.scan2chat.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
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
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
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
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import java.net.URLEncoder
import java.util.ArrayDeque
import java.util.LinkedHashSet
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern

class MainActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var tvDetected: TextView
    private lateinit var btnSend: Button
    private lateinit var btnOpenWhatsApp: Button
    private lateinit var btnCall: Button
    private lateinit var btnClear: Button
    private lateinit var btnDeliveryMode: Button
    private lateinit var btnBulkSend: Button
    private lateinit var etCustomMessage: EditText
    private lateinit var flashAlert: LinearLayout
    private lateinit var btnLogout: Button
    private lateinit var tvWhatsAppWarning: TextView
    private val cameraExecutor = Executors.newSingleThreadExecutor()
    private var lastDetectedNumber: String? = null
    private var confirmedNumber: String? = null
    private var detectionCount = 0
    private var lastScanTime = 0L
    private val MIN_SCAN_INTERVAL = 300L
    private var camera: Camera? = null
    private var mediaPlayer: MediaPlayer? = null
    private var bulkLimitDialogShown = false
    private var whatsappWarningShown = false

    private var isBulkScanMode = false

    private val phonePattern = Pattern.compile("(\\+?972[0-9]{8,9}|05[0-9]{8})")

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
    private val gson = Gson()

    private val defaultMessage = "היי 😊 משלוח בדרך 9:00-14:00. אפשר קומה/דירה+קוד? אם אין מישהו בבית להשאיר בדלת או בארון חשמל?"

    private val flashHandler = Handler(Looper.getMainLooper())
    private val hideFlashRunnable = Runnable { flashAlert.visibility = View.GONE }

    companion object {
        val bulkQueue = LinkedHashSet<String>()
        val contactedNumbers = mutableSetOf<String>()
        val replyMap = mutableMapOf<String, ReplyData>()
        var isDeliveryMode = false
        var isBulkMode = false
        private var onReplyUpdate: (() -> Unit)? = null
        lateinit var appContext: Context

        private const val PREF_NAME = "Scan2ChatPrefs"
        private const val KEY_REPLIES = "saved_replies"
        private const val KEY_WHATSAPP_WARNING = "whatsapp_warning_shown"
        private const val MAX_BULK_PER_WINDOW = 30
        private const val RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000L
        private val sendTimestamps = ArrayDeque<Long>()

        fun addReply(phone: String, data: ReplyData) {
            replyMap[phone] = data
            onReplyUpdate?.invoke()
            Log.d("REPLY_SAVED", "Saved reply for $phone: $data")
            saveRepliesToPrefs()

            Handler(Looper.getMainLooper()).post {
                try {
                    Toast.makeText(appContext, "תגובה התקבלה!", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Log.e("REPLY_SAVED", "Toast failed", e)
                }
            }
        }

        private fun saveRepliesToPrefs() {
            val prefs = appContext.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            val json = Gson().toJson(replyMap)
            prefs.edit().putString(KEY_REPLIES, json).apply()
        }

        fun loadRepliesFromPrefs() {
            val prefs = appContext.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            val json = prefs.getString(KEY_REPLIES, null) ?: return
            val type = object : TypeToken<Map<String, ReplyData>>() {}.type
            val saved = Gson().fromJson<Map<String, ReplyData>>(json, type)
            replyMap.clear()
            replyMap.putAll(saved)
            onReplyUpdate?.invoke()
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
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        appContext = this
        loadRepliesFromPrefs()
        supportActionBar?.hide()

        previewView = findViewById(R.id.previewView)
        tvDetected = findViewById(R.id.tvDetected)
        btnSend = findViewById(R.id.btnSend)
        btnOpenWhatsApp = findViewById(R.id.btnOpenWhatsApp)
        btnCall = findViewById(R.id.btnCall)
        btnClear = findViewById(R.id.btnClear)
        btnDeliveryMode = findViewById(R.id.btnDeliveryMode)
        btnBulkSend = findViewById(R.id.btnBulkSend)
        etCustomMessage = findViewById(R.id.etCustomMessage)
        flashAlert = findViewById(R.id.flashAlert)
        btnLogout = findViewById(R.id.btnLogout)
        tvWhatsAppWarning = findViewById(R.id.tvWhatsAppWarning)

        val prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE)
        whatsappWarningShown = prefs.getBoolean(KEY_WHATSAPP_WARNING, false)
        tvWhatsAppWarning.visibility = if (whatsappWarningShown) View.VISIBLE else View.GONE

        tvDetected.text = "סריקה..."

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
                sendSmsMessage(number, useCustomMessage = etCustomMessage.text.toString().trim().isNotEmpty())
            } ?: Toast.makeText(this, "לא זוהה מספר", Toast.LENGTH_SHORT).show()
        }

        btnOpenWhatsApp.setOnClickListener {
            showWhatsAppWarningIfNeeded()
            confirmedNumber?.let { openWhatsApp(it) }
                ?: Toast.makeText(this, "לא זוהה מספר", Toast.LENGTH_SHORT).show()
        }

        btnCall.setOnClickListener {
            confirmedNumber?.let { number ->
                val localNumber = if (number.startsWith("+972")) "0" + number.substring(4) else number
                startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$localNumber")))
            } ?: Toast.makeText(this, "לא זוהה מספר", Toast.LENGTH_SHORT).show()
        }

        btnClear.setOnClickListener { resetScanState() }

        btnDeliveryMode.setOnClickListener {
            if (isBulkScanMode) exitBulkScanMode()
            isDeliveryMode = !isDeliveryMode
            updateDeliveryButton()
            Toast.makeText(this, if (isDeliveryMode) "מצב משלוח הופעל" else "חזרת למצב סריקה", Toast.LENGTH_SHORT).show()
        }

        btnBulkSend.setOnClickListener {
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

        val smsPermissions = arrayOf(
            Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS
        )
        val missingSms = smsPermissions.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missingSms.isNotEmpty()) requestSmsPermissions.launch(missingSms.toTypedArray())

        checkAccessAndStart()
    }

    private fun showWhatsAppWarningIfNeeded() {
        if (whatsappWarningShown) return
        whatsappWarningShown = true
        tvWhatsAppWarning.visibility = View.VISIBLE
        getSharedPreferences(PREF_NAME, MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_WHATSAPP_WARNING, true)
            .apply()
    }

    private fun updateBulkSendButton() {
        val queueSize = bulkQueue.size
        btnBulkSend.visibility = View.VISIBLE
        if (isBulkScanMode) {
            btnBulkSend.text = "שלח לרשימה ($queueSize/30)"
            btnBulkSend.setBackgroundColor(Color.parseColor("#8E24AA"))
        } else {
            val suffix = if (queueSize == 0) "" else " ($queueSize)"
            btnBulkSend.text = "שליחה קבוצתית$suffix"
            btnBulkSend.setBackgroundColor(Color.parseColor("#9C27B0"))
        }
***
