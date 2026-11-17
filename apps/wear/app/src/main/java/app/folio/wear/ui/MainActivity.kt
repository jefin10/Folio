package app.folio.wear.ui

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.speech.RecognizerIntent
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import app.folio.wear.data.Money
import app.folio.wear.data.QueuedEntry
import app.folio.wear.data.Snapshot
import app.folio.wear.data.Store
import app.folio.wear.data.Sync
import app.folio.wear.data.VoiceParser

private val Ink = Color(0xFF0B0B0B)
private val Ink2 = Color(0xFF1A1A1A)
private val Chalk = Color(0xFFF4F3EE)
private val Mute = Color(0xFF8B8A85)
private val Mint = Color(0xFF3DDC97)
private val MintDeep = Color(0xFF146642)
private val Coral = Color(0xFFFF6B57)

private enum class Route { Home, Amount, Account, Category, Split, Done, Queue, Bills, People, Accounts }

/** Entry being composed on the watch. */
private data class Draft(
    val amountText: String = "",
    val description: String = "",
    val accountId: String? = null,
    val categoryId: String? = null,
    val personId: String? = null,
    val sharePaise: Long? = null,
    val viaVoice: Boolean = false,
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val startOnAdd = intent?.getStringExtra("route") == "add"
        setContent { FolioWearApp(startOnAdd) }
    }
}

@Composable
private fun FolioWearApp(startOnAdd: Boolean) {
    val ctx = LocalContext.current
    var route by remember { mutableStateOf(if (startOnAdd) Route.Amount else Route.Home) }
    var draft by remember { mutableStateOf(Draft()) }
    var tick by remember { mutableIntStateOf(0) } // bump to re-read local storage
    val snapshot: Snapshot? = remember(tick) { Store.snapshot(ctx) }
    val queue = remember(tick) { Store.queue(ctx) }
    val hidden = snapshot?.hideBalances == true
    fun money(p: Long) = if (hidden) "₹ ••••" else Money.format(p)

    LaunchedEffect(Unit) { Sync.retryAndRefresh(ctx) }

    val voice = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        if (res.resultCode == Activity.RESULT_OK) {
            val said = res.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull().orEmpty()
            val accounts = snapshot?.accounts.orEmpty()
            val p = VoiceParser.parse(said, accounts.map { it.name })
            val acc = VoiceParser.match(p.accountHint, accounts) { listOf(it.name) }
            val cat = VoiceParser.match(p.description.substringBefore(' '), snapshot?.categories.orEmpty()) { listOf(it.name) }
            val person = VoiceParser.match(p.personHint, snapshot?.people.orEmpty()) { listOf(it.name) }
            draft = Draft(
                amountText = p.amountPaise?.let { "${it / 100}" + if (it % 100 != 0L) ".${(it % 100).toString().padStart(2, '0')}" else "" }.orEmpty(),
                description = p.description.ifBlank { said },
                accountId = acc?.id,
                categoryId = cat?.id,
                personId = person?.id,
                sharePaise = if (person != null) p.personSharePaise else null,
                viaVoice = true,
            )
            route = if (p.amountPaise == null) Route.Amount else if (acc == null) Route.Account else if (cat == null) Route.Category else Route.Split
        }
    }
    fun startVoice() {
        voice.launch(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "e.g. “250 lunch with HDFC”")
        })
    }

    BackHandler(enabled = route != Route.Home) {
        route = when (route) {
            Route.Account -> Route.Amount
            Route.Category -> Route.Account
            Route.Split -> Route.Category
            else -> Route.Home
        }
    }

    MaterialTheme {
        when (route) {
            Route.Home -> ListScreen {
                item { Eyebrow("Today") }
                item { BigNumber(money(Store.todaySpend(ctx, Sync.today()))) }
                item {
                    Text(
                        if (snapshot == null) "Open Folio on your phone to sync" else "Spendable ${money(snapshot.liquid)}",
                        color = Mute, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                    )
                }
                item { Spacer(Modifier.height(6.dp)) }
                item { PopChip("＋  Spend", primary = true) { draft = Draft(); route = Route.Amount } }
                item { PopChip("🎙  Say it") { startVoice() } }
                snapshot?.upcoming?.firstOrNull()?.let { d ->
                    item { InfoChip("Next: ${d.name}", "${d.dueOn.takeLast(5).split('-').reversed().joinToString("/")} · ${d.amountPaise?.let(::money) ?: "varies"}", if (d.state == "overdue") Coral else Mute) { route = Route.Bills } }
                }
                item { InfoChip("Owed to you", money(snapshot?.receivables ?: 0)) { route = Route.People } }
                item { InfoChip("Balances", "${snapshot?.accounts?.size ?: 0} accounts") { route = Route.Accounts } }
                val pending = queue.count { it.status == "pending" }
                val failed = queue.count { it.status == "failed" }
                item { InfoChip("Sync", if (pending + failed == 0) "All synced" else "$pending waiting${if (failed > 0) " · $failed failed" else ""}", if (failed > 0) Coral else Mute) { route = Route.Queue } }
            }

            Route.Amount -> AmountPad(
                value = draft.amountText,
                onChange = { draft = draft.copy(amountText = it) },
                onVoice = { startVoice() },
                onNext = { route = Route.Account },
            )

            Route.Account -> ListScreen {
                item { Eyebrow("Paid with") }
                item { BigNumber(Money.parse(draft.amountText)?.let { Money.format(it) } ?: "₹0", small = true) }
                val accounts = snapshot?.accounts.orEmpty().filter { it.group != "loan" }
                if (accounts.isEmpty()) item { Text("Sync with your phone first", color = Mute, fontSize = 12.sp) }
                accounts.forEach { a ->
                    item { InfoChip(a.name, if (a.group == "credit") "Card" else money(a.balancePaise), accent = a.color?.let(::parseColor)) { draft = draft.copy(accountId = a.id); route = Route.Category } }
                }
            }

            Route.Category -> ListScreen {
                item { Eyebrow("For") }
                snapshot?.categories.orEmpty().forEach { c ->
                    item { InfoChip(c.name, null, accent = c.color?.let(::parseColor)) { draft = draft.copy(categoryId = c.id, description = draft.description.ifBlank { c.name }); route = Route.Split } }
                }
            }

            Route.Split -> ListScreen {
                item { Eyebrow("Paid for someone?") }
                item { PopChip("Just me — save", primary = true) { save(ctx, draft) { draft = Draft(); tick++; route = Route.Done } } }
                snapshot?.people.orEmpty().forEach { p ->
                    item {
                        InfoChip("Half for ${p.name}", null) {
                            val total = Money.parse(draft.amountText) ?: return@InfoChip
                            save(ctx, draft.copy(personId = p.id, sharePaise = total / 2)) { draft = Draft(); tick++; route = Route.Done }
                        }
                    }
                    item {
                        InfoChip("All for ${p.name}", null) {
                            val total = Money.parse(draft.amountText) ?: return@InfoChip
                            save(ctx, draft.copy(personId = p.id, sharePaise = total)) { draft = Draft(); tick++; route = Route.Done }
                        }
                    }
                }
            }

            Route.Done -> Box(Modifier.fillMaxSize().background(Ink).clickable { route = Route.Home }, contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(54.dp).clip(CircleShape).background(Mint), contentAlignment = Alignment.Center) { Text("✓", color = Ink, fontSize = 28.sp, fontWeight = FontWeight.Bold) }
                    Text("Recorded", color = Chalk, fontSize = 18.sp, fontFamily = FontFamily.Serif)
                    Text("Syncs with your phone", color = Mute, fontSize = 11.sp)
                }
                LaunchedEffect(Unit) { kotlinx.coroutines.delay(1400); route = Route.Home }
            }

            Route.Queue -> ListScreen {
                item { Eyebrow("Sync queue") }
                if (queue.isEmpty()) item { Text("Nothing recorded on the watch yet", color = Mute, fontSize = 12.sp, textAlign = TextAlign.Center) }
                queue.reversed().forEach { q ->
                    item { InfoChip("${Money.format(q.amountPaise)} · ${q.description}", when (q.status) { "synced" -> "✓ In your ledger"; "failed" -> "✕ ${q.message ?: "Rejected"}"; else -> "Waiting for phone" }, if (q.status == "failed") Coral else Mute) {} }
                }
                item { PopChip("Retry now") { Sync.retryAndRefresh(ctx); tick++ } }
            }

            Route.Bills -> ListScreen {
                item { Eyebrow("Coming up") }
                snapshot?.upcoming.orEmpty().forEach { d -> item { InfoChip(d.name, "${d.dueOn} · ${d.amountPaise?.let(::money) ?: "varies"}", if (d.state == "overdue") Coral else Mute) {} } }
                if (snapshot?.upcoming.isNullOrEmpty()) item { Text("Nothing due in 14 days", color = Mute, fontSize = 12.sp) }
            }

            Route.People -> ListScreen {
                item { Eyebrow("Owed to you") }
                snapshot?.people.orEmpty().filter { it.outstandingPaise != 0L }.forEach { p -> item { InfoChip(p.name, if (p.outstandingPaise > 0) "owes ${money(p.outstandingPaise)}" else "you owe ${money(-p.outstandingPaise)}", if (p.outstandingPaise > 0) Mint else Coral) {} } }
                if (snapshot?.people.orEmpty().none { it.outstandingPaise != 0L }) item { Text("All square", color = Mute, fontSize = 12.sp) }
            }

            Route.Accounts -> ListScreen {
                item { Eyebrow("Balances") }
                snapshot?.accounts.orEmpty().forEach { a -> item { InfoChip(a.name, if (a.group == "credit") "owes ${money(a.balancePaise)}" else money(a.balancePaise), accent = a.color?.let(::parseColor)) {} } }
            }
        }
    }
}

private fun save(ctx: android.content.Context, d: Draft, after: () -> Unit) {
    val amount = Money.parse(d.amountText) ?: return
    Sync.record(ctx, QueuedEntry.create(amount, d.description.ifBlank { "Watch entry" }, d.accountId, d.categoryId, d.personId, d.sharePaise, Sync.today(), d.viaVoice))
    after()
}

private fun parseColor(hex: String): Color? = try {
    Color(android.graphics.Color.parseColor(hex))
} catch (e: Exception) {
    null
}

@Composable
private fun ListScreen(content: androidx.wear.compose.foundation.lazy.ScalingLazyListScope.() -> Unit) {
    val state = rememberScalingLazyListState()
    Scaffold(
        modifier = Modifier.background(Ink),
        timeText = { TimeText() },
        positionIndicator = { PositionIndicator(scalingLazyListState = state) },
    ) {
        ScalingLazyColumn(
            state = state,
            modifier = Modifier.fillMaxSize().background(Ink),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
            content = content,
        )
    }
}

@Composable
private fun Eyebrow(text: String) =
    Text(text.uppercase(), color = Mute, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.6.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 18.dp))

@Composable
private fun BigNumber(text: String, small: Boolean = false) =
    Text(text, color = Chalk, fontSize = if (small) 22.sp else 30.sp, fontFamily = FontFamily.Serif, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(), maxLines = 1)

/** Raised mint action: face plus a darker offset edge. */
@Composable
private fun PopChip(label: String, primary: Boolean = false, onClick: () -> Unit) {
    Box(Modifier.fillMaxWidth(0.86f).height(48.dp).clickable(onClick = onClick)) {
        Box(Modifier.fillMaxSize().padding(start = 4.dp, top = 4.dp).background(if (primary) MintDeep else Color(0xFF2A2A2A)))
        Box(Modifier.fillMaxSize().padding(end = 4.dp, bottom = 4.dp).background(if (primary) Mint else Ink2), contentAlignment = Alignment.Center) {
            Text(label, color = if (primary) Ink else Chalk, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
    }
}

@Composable
private fun InfoChip(label: String, secondary: String?, tone: Color = Mute, accent: Color? = null, onClick: () -> Unit) {
    Chip(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(0.94f),
        colors = ChipDefaults.chipColors(backgroundColor = Ink2, contentColor = Chalk, secondaryContentColor = tone),
        icon = accent?.let { { Box(Modifier.size(14.dp).clip(RoundedCornerShape(4.dp)).background(it)) } },
        label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold) },
        secondaryLabel = secondary?.let { { Text(it, maxLines = 1, overflow = TextOverflow.Ellipsis, color = tone) } },
    )
}

/** Compact keypad sized for a round 1.2–1.5" screen. */
@Composable
private fun AmountPad(value: String, onChange: (String) -> Unit, onVoice: () -> Unit, onNext: () -> Unit) {
    val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫")
    Box(Modifier.fillMaxSize().background(Ink), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("🎙", fontSize = 16.sp, modifier = Modifier.clickable(onClick = onVoice).padding(4.dp))
                Text(if (value.isEmpty()) "₹0" else "₹$value", color = Chalk, fontSize = 24.sp, fontFamily = FontFamily.Serif, maxLines = 1)
                val ok = Money.parse(value) != null
                Box(Modifier.size(30.dp).clip(CircleShape).background(if (ok) Mint else Ink2).clickable(enabled = ok, onClick = onNext), contentAlignment = Alignment.Center) {
                    Text("→", color = if (ok) Ink else Mute, fontWeight = FontWeight.Bold)
                }
            }
            keys.chunked(3).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    row.forEach { k ->
                        Box(
                            Modifier.width(44.dp).height(30.dp).clip(RoundedCornerShape(9.dp)).background(Ink2).clickable {
                                val next = when (k) {
                                    "⌫" -> value.dropLast(1)
                                    "." -> if (value.contains('.')) value else if (value.isEmpty()) "0." else "$value."
                                    else -> if (value.substringAfter('.', "").length >= 2 && value.contains('.')) value else (value + k).trimStart('0').ifEmpty { "0" }
                                }
                                if (next.length <= 9) onChange(next)
                            },
                            contentAlignment = Alignment.Center,
                        ) { Text(k, color = Chalk, fontSize = 15.sp, fontWeight = FontWeight.SemiBold) }
                    }
                }
            }
        }
    }
}
