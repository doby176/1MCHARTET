package com.scan2chat.app

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.text.HtmlCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import java.nio.charset.StandardCharsets

class TermsActivity : AppCompatActivity() {

    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_terms)

        val tvTermsContent = findViewById<TextView>(R.id.tvTermsContent)
        val btnDisagree = findViewById<Button>(R.id.btnDisagree)
        val btnAgree = findViewById<Button>(R.id.btnAgree)

        val termsHtml = resources.openRawResource(R.raw.terms_content)
            .bufferedReader(StandardCharsets.UTF_8)
            .use { it.readText() }
        tvTermsContent.text = HtmlCompat.fromHtml(termsHtml, HtmlCompat.FROM_HTML_MODE_COMPACT)

        btnAgree.setOnClickListener { acceptTermsAndProceed() }
        btnDisagree.setOnClickListener {
            Toast.makeText(this, "נא לאשר את תנאי השימוש כדי להמשיך", Toast.LENGTH_LONG).show()
        }
    }

    private fun acceptTermsAndProceed() {
        val user = auth.currentUser
        if (user == null) {
            startActivity(Intent(this, AuthActivity::class.java))
            finish()
            return
        }

        val uid = user.uid
        val updates = mapOf("terms_accepted" to true)

        db.collection("users").document(uid)
            .set(updates, SetOptions.merge())
            .addOnSuccessListener {
                getSharedPreferences("Scan2ChatPrefs", MODE_PRIVATE)
                    .edit()
                    .putBoolean("terms_accepted", true)
                    .apply()

                startActivity(Intent(this, MainActivity::class.java))
                finish()
            }
            .addOnFailureListener { e ->
                Log.e("TermsActivity", "Failed to save terms_accepted", e)
                Toast.makeText(this, "שגיאה: ${e.message}", Toast.LENGTH_LONG).show()
            }
    }

    override fun onBackPressed() {
        Toast.makeText(this, "נא לאשר את תנאי השימוש", Toast.LENGTH_SHORT).show()
    }
}