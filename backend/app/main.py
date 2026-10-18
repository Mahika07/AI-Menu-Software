
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.core.config import settings
from app.core.rate_limit import limiter

from app.routes.categories import router as category_router
from app.routes.auth import router as auth_router
from app.routes.restaurants import router as restaurant_router
from app.routes.branches import router as branch_router
from app.routes.dishes import router as dish_router
from app.routes.public_menu import router as public_menu_router
from app.routes.reviews import public_router as public_review_router
from app.routes.reviews import owner_router as owner_review_router
from app.routes.ai import router as ai_router
from app.routes.dashboard import router as dashboard_router
from app.routes.tables import router as tables_router
from app.routes.menu_import import router as menu_import_router
from app.routes.analytics import router as analytics_router
from app.routes.orders import router as orders_router
from app.routes.owner_orders import router as owner_orders_router
from app.routes.sales_analytics import router as sales_analytics_router
from app.routes import dining_sessions
from app.routes.bills import router as bills_router

app = FastAPI(
    title="Smart Menu API",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
)

app.state.limiter = limiter

app.add_exception_handler(
    RateLimitExceeded,
    _rate_limit_exceeded_handler,
)


@app.middleware("http")
async def safe_error_handler(request: Request, call_next):
    try:
        return await call_next(request)

    except Exception as exc:
        print(
            f"Unhandled server error: "
            f"{type(exc).__name__}: {exc}"
        )

        return JSONResponse(
            status_code=500,
            content={
                "detail": "An unexpected server error occurred."
            },
        )


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

allowed_hosts = (
    ["localhost", "127.0.0.1"]
    if settings.ENVIRONMENT != "production"
    else [settings.API_HOST]
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=allowed_hosts,
)


# ---------------------------------------------------------
# Main routes
# ---------------------------------------------------------

app.include_router(auth_router)
app.include_router(restaurant_router)
app.include_router(branch_router)
app.include_router(category_router)
app.include_router(dish_router)
app.include_router(tables_router)
app.include_router(public_menu_router)
app.include_router(public_review_router)
app.include_router(owner_review_router)
app.include_router(ai_router)
app.include_router(dashboard_router)
app.include_router(menu_import_router)
app.include_router(analytics_router)
app.include_router(orders_router)
app.include_router(owner_orders_router)
app.include_router(sales_analytics_router)
app.include_router(dining_sessions.router)
app.include_router(bills_router)

# ---------------------------------------------------------
# API v1
# Existing routes remain available for backward compatibility.
# ---------------------------------------------------------

API_V1_PREFIX = "/api/v1"

app.include_router(auth_router, prefix=API_V1_PREFIX)
app.include_router(restaurant_router, prefix=API_V1_PREFIX)
app.include_router(branch_router, prefix=API_V1_PREFIX)
app.include_router(category_router, prefix=API_V1_PREFIX)
app.include_router(dish_router, prefix=API_V1_PREFIX)
app.include_router(tables_router, prefix=API_V1_PREFIX)
app.include_router(public_menu_router, prefix=API_V1_PREFIX)
app.include_router(public_review_router, prefix=API_V1_PREFIX)
app.include_router(owner_review_router, prefix=API_V1_PREFIX)
app.include_router(ai_router, prefix=API_V1_PREFIX)
app.include_router(dashboard_router, prefix=API_V1_PREFIX)
app.include_router(menu_import_router, prefix=API_V1_PREFIX)
app.include_router(analytics_router, prefix=API_V1_PREFIX)
app.include_router(orders_router, prefix=API_V1_PREFIX)
app.include_router(owner_orders_router, prefix=API_V1_PREFIX)
app.include_router(sales_analytics_router, prefix=API_V1_PREFIX)
app.include_router(bills_router, prefix=API_V1_PREFIX)

@app.get("/health")
def health():
    return {"status": "ok"}
