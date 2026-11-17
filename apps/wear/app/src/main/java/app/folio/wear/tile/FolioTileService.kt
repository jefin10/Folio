package app.folio.wear.tile

import androidx.concurrent.futures.CallbackToFutureAdapter
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import app.folio.wear.data.Money
import app.folio.wear.data.Store
import app.folio.wear.data.Sync
import app.folio.wear.ui.MainActivity
import com.google.common.util.concurrent.ListenableFuture

/** Glanceable tile: today's spend, spendable money, next bill, and a one-tap "Spend". */
class FolioTileService : TileService() {
    private val chalk = 0xFFF4F3EE.toInt()
    private val mute = 0xFF8B8A85.toInt()
    private val mint = 0xFF3DDC97.toInt()
    private val ink = 0xFF04140D.toInt()

    private fun text(value: String, size: Float, color: Int, bold: Boolean = false) =
        LayoutElementBuilders.Text.Builder()
            .setText(value)
            .setMaxLines(1)
            .setFontStyle(
                LayoutElementBuilders.FontStyle.Builder()
                    .setSize(sp(size))
                    .setColor(argb(color))
                    .setWeight(if (bold) LayoutElementBuilders.FONT_WEIGHT_BOLD else LayoutElementBuilders.FONT_WEIGHT_NORMAL)
                    .build()
            ).build()

    private fun spacer(h: Float) = LayoutElementBuilders.Spacer.Builder().setHeight(dp(h)).build()

    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> =
        CallbackToFutureAdapter.getFuture { completer ->
            val snap = Store.snapshot(this)
            val hidden = snap?.hideBalances == true
            val today = Store.todaySpend(this, Sync.today())
            val next = snap?.upcoming?.firstOrNull()

            val addAction = ActionBuilders.LaunchAction.Builder()
                .setAndroidActivity(
                    ActionBuilders.AndroidActivity.Builder()
                        .setPackageName(packageName)
                        .setClassName(MainActivity::class.java.name)
                        .addKeyToExtraMapping("route", ActionBuilders.AndroidStringExtra.Builder().setValue("add").build())
                        .build()
                ).build()

            val button = LayoutElementBuilders.Box.Builder()
                .setWidth(dp(96f)).setHeight(dp(34f))
                .setModifiers(
                    ModifiersBuilders.Modifiers.Builder()
                        .setClickable(ModifiersBuilders.Clickable.Builder().setId("spend").setOnClick(addAction).build())
                        .setBackground(ModifiersBuilders.Background.Builder().setColor(argb(mint)).setCorner(ModifiersBuilders.Corner.Builder().setRadius(dp(4f)).build()).build())
                        .build()
                )
                .addContent(text("+ Spend", 14f, ink, bold = true))
                .build()

            val column = LayoutElementBuilders.Column.Builder()
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                .addContent(text("TODAY", 10f, mute, bold = true))
                .addContent(text(if (hidden) "₹ ••••" else Money.format(today), 26f, chalk, bold = true))
                .addContent(text(if (snap == null) "Open Folio on phone" else if (hidden) "Spendable ₹ ••••" else "Spendable ${Money.compact(snap.liquid)}", 12f, mute))
                .addContent(spacer(6f))
                .addContent(text(next?.let { "${it.name} · ${it.dueOn.takeLast(5).split('-').reversed().joinToString("/")}" } ?: "No bills soon", 11f, if (next?.state == "overdue") 0xFFFF6B57.toInt() else mute))
                .addContent(spacer(8f))
                .addContent(button)
                .build()

            val root = LayoutElementBuilders.Box.Builder()
                .setWidth(expand()).setHeight(expand())
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
                .addContent(column)
                .build()

            completer.set(
                TileBuilders.Tile.Builder()
                    .setResourcesVersion("1")
                    .setFreshnessIntervalMillis(15 * 60 * 1000L)
                    .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(root))
                    .build()
            )
            "folio-tile"
        }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        CallbackToFutureAdapter.getFuture { completer ->
            completer.set(ResourceBuilders.Resources.Builder().setVersion("1").build())
            "folio-tile-resources"
        }
}
