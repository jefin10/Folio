package app.folio.wear.data

/**
 * Kotlin port of packages/core/src/voice.ts for dictated entries on the watch:
 *   "250 lunch"  ·  "spent 1.2k on groceries using hdfc"  ·  "dinner 900 split with rahul"
 */
data class ParsedEntry(
    val amountPaise: Long?,
    val description: String,
    val accountHint: String?,
    val personHint: String?,
    val personSharePaise: Long?,
)

object VoiceParser {
    private val amountRe = Regex("(?i)(?:₹|rs\\.?|inr)?\\s*(\\d[\\d,]*(?:\\.\\d{1,2})?\\s*(?:k|l|lakh|lac|cr)?)\\b")
    private val owesRe = Regex("(?i)\\b([a-z][a-z ]{1,24}?)\\s+(?:owes?|will pay)\\s+(?:me\\s+)?(₹?\\s*\\d[\\d,]*(?:\\.\\d{1,2})?\\s*k?|half)")
    private val splitRe = Regex("(?i)\\bsplit(?:ting)?\\s+with\\s+([a-z][a-z ]{1,24}?)(?:\\s+(₹?\\s*\\d[\\d,]*(?:\\.\\d{1,2})?\\s*k?))?(?=\\s|$|,)")
    private val accRe = Regex("(?i)\\b(using|via|through|paid by|paid with|on|with|from)\\s+(?:my\\s+)?([a-z][a-z0-9 ]{1,20}?)\\s*(card|account|bank|wallet)?(?=\\s*(?:,|$|\\s(?:for|on|at)\\s))")
    private val filler = Regex("(?i)\\b(spent|spend|paid|pay|bought|for|on|at|rupees|rs|i|me|my)\\b")

    fun parse(input: String, accountNames: List<String> = emptyList()): ParsedEntry {
        var text = " " + input.trim().replace(Regex("\\s+"), " ") + " "
        var personHint: String? = null
        var share: Long? = null
        var halfShare = false

        owesRe.find(text)?.let { m ->
            personHint = m.groupValues[1].trim()
            if (m.groupValues[2].equals("half", true)) halfShare = true else share = Money.parse(m.groupValues[2])
            text = text.replace(m.value, " ")
        }
        if (personHint == null) splitRe.find(text)?.let { m ->
            personHint = m.groupValues[1].trim()
            if (m.groupValues[2].isNotBlank()) share = Money.parse(m.groupValues[2]) else halfShare = true
            text = text.replace(m.value, " ")
        }

        val known = accountNames.map { it.lowercase().replace(Regex("[^a-z0-9]"), "") }.filter { it.isNotEmpty() }
        var accountHint: String? = null
        for (m in accRe.findAll(text)) {
            val cue = m.groupValues[1].lowercase()
            val phrase = m.groupValues[2].trim()
            val key = phrase.lowercase().replace(Regex("[^a-z0-9]"), "")
            val strong = cue !in setOf("on", "with", "from") || m.groupValues[3].isNotEmpty()
            if (strong || known.any { it == key || it.contains(key) || key.contains(it) }) {
                accountHint = phrase
                text = text.replace(m.value, " ")
                break
            }
        }

        var amount: Long? = null
        amountRe.find(text)?.let { m ->
            amount = Money.parse(m.groupValues[1].replace(" ", ""))
            text = text.replace(m.value, " ")
        }
        if (halfShare && amount != null) share = amount!! / 2

        val desc = text.replace(filler, " ").replace(Regex("[,.]+"), " ").replace(Regex("\\s+"), " ").trim()
        return ParsedEntry(amount, desc.replaceFirstChar { it.uppercase() }, accountHint, personHint, share)
    }

    /** Fuzzy pick by spoken hint, same scoring as matchByHint in core. */
    fun <T> match(hint: String?, items: List<T>, names: (T) -> List<String?>): T? {
        val h = hint?.lowercase()?.replace(Regex("[^a-z0-9]"), "") ?: return null
        if (h.isEmpty()) return null
        var best: T? = null
        var bestScore = 0
        for (item in items) for (raw in names(item)) {
            val n = raw?.lowercase()?.replace(Regex("[^a-z0-9]"), "") ?: continue
            val score = when {
                n == h -> 3
                n.startsWith(h) || h.startsWith(n) -> 2
                n.contains(h) || h.contains(n) -> 1
                else -> 0
            }
            if (score > bestScore) { bestScore = score; best = item }
        }
        return best
    }
}
