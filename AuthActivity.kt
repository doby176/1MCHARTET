package com.scan2chat.app

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.scan2chat.app.databinding.ActivityAuthBinding

class AuthActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAuthBinding
    private lateinit var auth: FirebaseAuth
    private lateinit var db: FirebaseFirestore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAuthBinding.inflate(layoutInflater)
        setContentView(binding.root)

        FirebaseApp.initializeApp(this)
        auth = FirebaseAuth.getInstance()
        db = FirebaseFirestore.getInstance()

        // Already logged in
        val currentUser = auth.currentUser
        if (currentUser != null) {
            handleEmailVerification(currentUser) {
                checkTermsAndProceed()
            }
            return
        }

        binding.btnLogin.setOnClickListener { tryLoginOrRegister() }
        binding.btnRegister.setOnClickListener { register() }
        binding.tvForgot.setOnClickListener { resetPassword() }

        // Press Enter on password field
        binding.etPassword.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE) {
                tryLoginOrRegister()
                true
            } else false
        }
    }

    private fun tryLoginOrRegister() {
        val email = binding.etEmail.text.toString().trim()
        val pass = binding.etPassword.text.toString().trim()

        if (email.isEmpty() || pass.length < 6) {
            Toast.makeText(this, "אימייל וסיסמה (6+ תווים)", Toast.LENGTH_SHORT).show()
            return
        }

        auth.signInWithEmailAndPassword(email, pass)
            .addOnSuccessListener {
                val user = auth.currentUser!!
                handleEmailVerification(user) {
                    Toast.makeText(this, "התחברת!", Toast.LENGTH_SHORT).show()
                    checkTermsAndProceed()
                }
            }
            .addOnFailureListener {
                autoRegister(email, pass)
            }
    }

    private fun autoRegister(email: String, pass: String) {
        auth.createUserWithEmailAndPassword(email, pass)
            .addOnSuccessListener {
                createUserDoc() // ← יוצר 7 ימי ניסיון
                val user = auth.currentUser!!
                handleEmailVerification(user) {
                    Toast.makeText(this, "נרשמת ואומתה!", Toast.LENGTH_SHORT).show()
                    checkTermsAndProceed()
                }
            }
            .addOnFailureListener {
                Toast.makeText(this, "שגיאה: ${it.message}", Toast.LENGTH_LONG).show()
            }
    }

    private fun register() {
        val email = binding.etEmail.text.toString().trim()
        val pass = binding.etPassword.text.toString().trim()

        if (email.isEmpty() || pass.length < 6) {
            Toast.makeText(this, "אימייל וסיסמה (6+ תווים)", Toast.LENGTH_SHORT).show()
            return
        }

        auth.createUserWithEmailAndPassword(email, pass)
            .addOnSuccessListener {
                createUserDoc() // ← יוצר 7 ימי ניסיון
                val user = auth.currentUser!!
                handleEmailVerification(user) {
                    Toast.makeText(this, "נרשמת ואומתה!", Toast.LENGTH_SHORT).show()
                    checkTermsAndProceed()
                }
            }
            .addOnFailureListener {
                Toast.makeText(this, "שגיאה: ${it.message}", Toast.LENGTH_LONG).show()
            }
    }

    private fun handleEmailVerification(user: FirebaseUser, onVerified: () -> Unit) {
        if (user.isEmailVerified) {
            onVerified()
            return
        }

        user.sendEmailVerification()
            .addOnSuccessListener {
                Toast.makeText(this, "נשלח מייל אימות. בדוק את התיבה והתחבר מחדש.", Toast.LENGTH_LONG).show()
            }
            .addOnFailureListener {
                Toast.makeText(this, "שגיאה בשליחת מייל אימות: ${it.message}", Toast.LENGTH_LONG).show()
            }

        FirebaseAuth.getInstance().signOut()
    }

    // יוצר משתמש עם 7 ימי ניסיון במקום 0
    private fun createUserDoc() {
        val uid = auth.currentUser?.uid ?: return
        val email = auth.currentUser?.email.orEmpty()

        // 7 ימי ניסיון = 7 * 24 * 60 * 60 * 1000
        val trialEnd = System.currentTimeMillis() + 7 * 24 * 60 * 60 * 1000

        val userDoc = hashMapOf(
            "uid" to uid,
            "email" to email,
            "lifetime" to false,
            "expires_at" to trialEnd,  // ← 7 ימים במקום 0
            "terms_accepted" to false
        )

        db.collection("users").document(uid)
            .set(userDoc, SetOptions.merge())
            .addOnFailureListener {
                Log.e("Auth", "Failed to create user doc", it)
            }
    }

    private fun resetPassword() {
        val email = binding.etEmail.text.toString().trim()
        if (email.isEmpty()) {
            Toast.makeText(this, "הכנס אימייל לאיפוס", Toast.LENGTH_SHORT).show()
            return
        }

        auth.sendPasswordResetEmail(email)
            .addOnSuccessListener {
                Toast.makeText(this, "נשלח מייל איפוס", Toast.LENGTH_SHORT).show()
            }
            .addOnFailureListener {
                Toast.makeText(this, "שגיאה: ${it.message}", Toast.LENGTH_SHORT).show()
            }
    }

    private fun checkTermsAndProceed() {
        val user = auth.currentUser ?: return
        val uid = user.uid

        db.collection("users").document(uid).get()
            .addOnSuccessListener { doc ->
                val firestoreAccepted = doc.getBoolean("terms_accepted") == true
                val localAccepted = getSharedPreferences("Scan2ChatPrefs", MODE_PRIVATE)
                    .getBoolean("terms_accepted", false)

                if (firestoreAccepted || localAccepted) {
                    startActivity(Intent(this, MainActivity::class.java))
                } else {
                    startActivity(Intent(this, TermsActivity::class.java))
                }
                finish()
            }
            .addOnFailureListener {
                // Firestore failed — fallback to local
                val localAccepted = getSharedPreferences("Scan2ChatPrefs", MODE_PRIVATE)
                    .getBoolean("terms_accepted", false)

                if (localAccepted) {
                    startActivity(Intent(this, MainActivity::class.java))
                } else {
                    startActivity(Intent(this, TermsActivity::class.java))
                }
                finish()
            }
    }
}