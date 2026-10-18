import { Leaf } from "lucide-react";

function DishCard({ dish }) {
  return (
    <div className="dish-card">
      {dish.image_url && (
        <img src={dish.image_url} alt={dish.name} className="dish-image" />
      )}

      <div className="dish-content">
        <div className="dish-header">
          <h3>{dish.name}</h3>

          <span className="dish-price">₹{Number(dish.price).toFixed(2)}</span>
        </div>

        {dish.description && (
          <p className="dish-description">{dish.description}</p>
        )}

        <div className="dish-tags">
          {dish.dietary_type && (
            <span className="tag">
              <Leaf size={14} />
              {dish.dietary_type}
            </span>
          )}

          {dish.spice_level && (
            <span className="tag">🌶️ {dish.spice_level}</span>
          )}

          {dish.serving_size && (
            <span className="tag">👥 {dish.serving_size}</span>
          )}
        </div>

        {dish.allergens && (
          <p className="allergens">Allergens: {dish.allergens}</p>
        )}
      </div>
    </div>
  );
}

export default DishCard;
