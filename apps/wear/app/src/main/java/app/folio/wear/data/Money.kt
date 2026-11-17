package app.folio.wear.data

/**
 * Exact money on the watch: amounts are Long paise, never Double.
 * Mirrors packages/core/src/money.ts (parseAmount / formatMoney).
 */
object Money {
    fun parse(input: String): Long? {
        var s = input.trim().replace(Regex("[₹,\\s_]"), "").replace(Regex("^(?i)(rs\\.?|inr)"), "")
        if (s.isEmpty()) return null
        var multiplier = 1L
        val suffix = Regex("(?i)(k|l|lakh|lac|cr|crore)$").find(s)
        if (suffix != null) {
            multiplier = when (suffix.value.lowercase()) {
                "k" -> 1_000L
                "l", "lakh", "lac" -> 1_00_000L
                else -> 1_00_00_000L
            }
            s = s.dropLast(suffix.value.length)
        }
        val m = Regex("^(\\d*)(?:\\.(\\d{0,2}))?$").find(s) ?: return null
        val whole = m.groupValues[1]
        val frac = m.groupValues[2]
        if (whole.isEmpty() && frac.isEmpty()) return null
        val rupees = if (whole.isEmpty()) 0L else whole.toLongOrNull() ?: return null
        val paise = frac.padEnd(2, '0').toLong()
        // (rupees + paise/100) * multiplier, kept exact.
        val total = rupees * 100L * multiplier + paise * multiplier
        return if (total <= 0L) null else total
    }

    fun format(paise: Long, decimals: Boolean = false): String {
        val neg = paise < 0
        val a = kotlin.math.abs(paise)
        val rupees = (a / 100).toString()
        val grouped = if (rupees.length <= 3) rupees else {
            val last3 = rupees.takeLast(3)
            var rest = rupees.dropLast(3)
            val parts = ArrayList<String>()
            while (rest.length > 2) {
                parts.add(0, rest.takeLast(2)); rest = rest.dropLast(2)
            }
            if (rest.isNotEmpty()) parts.add(0, rest)
            parts.joinToString(",") + "," + last3
        }
        val frac = if (decimals || a % 100 != 0L) "." + (a % 100).toString().padStart(2, '0') else ""
        return (if (neg) "−" else "") + "₹" + grouped + (if (decimals) frac else "")
    }

    /** ₹950 · ₹12.4K · ₹3.2L · ₹1.1Cr — never rounds up. */
    fun compact(paise: Long): String {
        val r = kotlin.math.abs(paise) / 100
        val sign = if (paise < 0) "−" else ""
        fun f(unit: Long, suf: String, places: Int): String {
            val scale = Math.pow(10.0, places.toDouble()).toLong()
            val scaled = r * scale / unit
            val whole = scaled / scale
            val fr = (scaled % scale).toString().padStart(places, '0').trimEnd('0')
            return "$whole${if (fr.isNotEmpty() && whole < 100) ".$fr" else ""}$suf"
        }
        val body = when {
            r >= 1_00_00_000 -> f(1_00_00_000, "Cr", 2)
            r >= 1_00_000 -> f(1_00_000, "L", 2)
            r >= 1_000 -> f(1_000, "K", 1)
            else -> r.toString()
        }
        return "$sign₹$body"
    }
}
